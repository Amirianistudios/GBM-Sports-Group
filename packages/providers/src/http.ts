/**
 * Shared HTTP plumbing for every provider adapter.
 *
 * Provides the three things a football data collector always needs and always
 * gets wrong the first time: rate limiting, retry with backoff, and honest
 * identification of the caller.
 */

import { ProviderCode, ProviderError } from './types.js';

/**
 * Token-bucket-ish serial rate limiter.
 *
 * Wyscout documents roughly 12 req/s and will start returning 429s above that.
 * Requests are queued and spaced rather than fired concurrently, because a
 * burst that trips a provider's limiter costs more wall-clock time (and risks
 * an account suspension) than simply pacing correctly.
 */
export class RateLimiter {
  private queue: Promise<void> = Promise.resolve();
  private readonly minIntervalMs: number;
  private lastStart = 0;

  constructor(requestsPerSecond: number) {
    this.minIntervalMs = requestsPerSecond > 0 ? 1000 / requestsPerSecond : 0;
  }

  async acquire(): Promise<void> {
    const run = this.queue.then(async () => {
      const elapsed = Date.now() - this.lastStart;
      const wait = this.minIntervalMs - elapsed;
      if (wait > 0) await sleep(wait);
      this.lastStart = Date.now();
    });
    // Swallow rejections on the chain itself so one failure cannot poison the
    // queue for every subsequent caller.
    this.queue = run.catch(() => undefined);
    return run;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface HttpClientOptions {
  provider: ProviderCode;
  baseUrl: string;
  headers?: Record<string, string>;
  requestsPerSecond?: number;
  maxRetries?: number;
  timeoutMs?: number;
  userAgent?: string;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  method?: string;
  /** Return null instead of throwing when the provider responds 404. */
  allowNotFound?: boolean;
}

export class HttpClient {
  private readonly limiter: RateLimiter;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(private readonly opts: HttpClientOptions) {
    this.limiter = new RateLimiter(opts.requestsPerSecond ?? 5);
    this.maxRetries = opts.maxRetries ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  buildUrl(path: string, query?: RequestOptions['query']): string {
    const base = this.opts.baseUrl.replace(/\/+$/, '');
    const suffix = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${base}${suffix}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T | null> {
    const url = this.buildUrl(path, options.query);
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.limiter.acquire();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          method: options.method ?? 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': this.opts.userAgent ?? 'GBM-Intelligence/0.1',
            ...this.opts.headers,
            ...options.headers,
          },
          signal: controller.signal,
        });

        if (response.status === 404 && options.allowNotFound) return null;

        // 429/5xx are transient: honour Retry-After when the provider sends it.
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = Number(response.headers.get('retry-after'));
          const backoff = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : Math.min(2 ** attempt * 1000, 30_000);

          if (attempt < this.maxRetries) {
            await sleep(backoff);
            continue;
          }
          throw new ProviderError(
            this.opts.provider,
            `HTTP ${response.status} after ${this.maxRetries} retries: ${url}`,
            response.status,
          );
        }

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new ProviderError(
            this.opts.provider,
            `HTTP ${response.status} ${response.statusText}: ${url} ${body.slice(0, 400)}`,
            response.status,
          );
        }

        const text = await response.text();
        if (!text) return null;

        try {
          return JSON.parse(text) as T;
        } catch {
          // Some providers return HTML on auth failure with a 200 status.
          throw new ProviderError(
            this.opts.provider,
            `Expected JSON but got non-JSON response from ${url}: ${text.slice(0, 200)}`,
          );
        }
      } catch (error) {
        lastError = error;
        // Auth/permission failures are permanent — retrying wastes quota.
        if (error instanceof ProviderError && error.status && error.status < 500 && error.status !== 429) {
          throw error;
        }
        if (attempt >= this.maxRetries) break;
        await sleep(Math.min(2 ** attempt * 1000, 15_000));
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new ProviderError(this.opts.provider, `Request failed: ${url}`);
  }

  /** Fetch raw text (for CSV/HTML sources rather than JSON APIs). */
  async requestText(path: string, options: RequestOptions = {}): Promise<string | null> {
    const url = this.buildUrl(path, options.query);
    await this.limiter.acquire();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          'User-Agent': this.opts.userAgent ?? 'GBM-Intelligence/0.1',
          ...this.opts.headers,
          ...options.headers,
        },
        signal: controller.signal,
      });
      if (response.status === 404 && options.allowNotFound) return null;
      if (!response.ok) {
        throw new ProviderError(
          this.opts.provider,
          `HTTP ${response.status} ${response.statusText}: ${url}`,
          response.status,
        );
      }
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Stable SHA-256 of a payload, used for source_records change detection. */
export async function payloadHash(payload: unknown): Promise<string> {
  const canonical = JSON.stringify(payload, Object.keys(payload as object ?? {}).sort());
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
