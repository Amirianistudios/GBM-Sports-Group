/**
 * Runtime configuration for the ingestion service.
 *
 * Secrets are read from the environment at run time and are never logged,
 * echoed or written to disk. `.env.local` at the repository root is the local
 * development source; in CI and Supabase these arrive as real environment
 * variables.
 */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Repository root, found by walking up to the directory holding pnpm-workspace.yaml. */
export function repoRoot(): string {
  let dir = HERE;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('Could not locate repository root (no pnpm-workspace.yaml found).');
}

let loaded = false;
function ensureDotenv(): void {
  if (loaded) return;
  const root = repoRoot();
  // .env.local wins; .env is the committed-safe fallback. Neither is tracked.
  loadDotenv({ path: resolve(root, '.env.local'), quiet: true });
  loadDotenv({ path: resolve(root, '.env'), quiet: true });
  loaded = true;
}

/** Reads a required variable, failing with an actionable message rather than a stack trace. */
export function requireEnv(name: string): string {
  ensureDotenv();
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required environment variable ${name}.\n` +
        `Add it to .env.local at the repository root (see .env.example), or export it before running.`,
    );
  }
  return value.trim();
}

export function optionalEnv(name: string): string | undefined {
  ensureDotenv();
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

/** True when a variable is set — used for capability reporting without revealing values. */
export function hasEnv(name: string): boolean {
  ensureDotenv();
  return Boolean(process.env[name] && process.env[name]!.trim());
}

export const paths = {
  root: () => repoRoot(),
  /** Raw provider datasets. Git-ignored: large and reproducibly re-downloadable. */
  data: () => resolve(repoRoot(), 'data'),
  transfermarkt: () => resolve(repoRoot(), 'data', 'transfermarkt'),
  reep: () => resolve(repoRoot(), 'data', 'reep'),
  /** Dataset manifests. Tracked: they record exactly which version produced a run. */
  manifests: () => resolve(repoRoot(), 'data', 'manifests'),
};
