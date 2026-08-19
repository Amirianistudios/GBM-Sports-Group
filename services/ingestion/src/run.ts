/**
 * Ingestion observability.
 *
 * Every real ingestion opens an `ingestion_runs` row, accumulates counters,
 * records per-record failures in `ingestion_errors`, and closes with a
 * terminal status. A run that crashes still leaves its row behind marked
 * FAILED with the error attached, which is the difference between a pipeline
 * you can operate and one you can only rerun and hope.
 */
import { admin } from './supabase.js';

export interface Counters {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
}

export class IngestionRun {
  readonly counters: Counters = { fetched: 0, created: 0, updated: 0, skipped: 0 };
  private errors = 0;
  private readonly summary: Record<string, unknown> = {};

  private constructor(
    readonly id: string,
    readonly jobKey: string,
  ) {}

  static async start(
    jobKey: string,
    opts: { providerCode?: string; params?: Record<string, unknown>; triggeredBy?: string } = {},
  ): Promise<IngestionRun> {
    // Link the run to its job definition when one is registered, so the job's
    // last_run_at can be maintained and the cron schedule stays meaningful.
    const { data: job } = await admin()
      .from('ingestion_jobs')
      .select('id')
      .eq('key', jobKey)
      .maybeSingle();

    const { data, error } = await admin()
      .from('ingestion_runs')
      .insert({
        job_id: job?.id ?? null,
        job_key: jobKey,
        provider_code: opts.providerCode ?? null,
        status: 'RUNNING',
        triggered_by: opts.triggeredBy ?? 'cli',
        params: opts.params ?? {},
      })
      .select('id')
      .single();

    if (error) throw new Error(`Could not open ingestion run '${jobKey}': ${error.message}`);
    return new IngestionRun(data.id as string, jobKey);
  }

  count(patch: Partial<Counters>): void {
    for (const [k, v] of Object.entries(patch)) {
      this.counters[k as keyof Counters] += v ?? 0;
    }
  }

  note(key: string, value: unknown): void {
    this.summary[key] = value;
  }

  async fail(resourceType: string, externalId: string | null, message: string, detail?: unknown) {
    this.errors += 1;
    await admin().from('ingestion_errors').insert({
      run_id: this.id,
      job_key: this.jobKey,
      resource_type: resourceType,
      external_id: externalId,
      message: message.slice(0, 2000),
      detail: detail ? JSON.parse(JSON.stringify(detail)) : null,
    });
  }

  async finish(status: 'SUCCESS' | 'FAILED' | 'PARTIAL' = 'SUCCESS'): Promise<void> {
    const resolved = status === 'SUCCESS' && this.errors > 0 ? 'PARTIAL' : status;
    const finishedAt = new Date().toISOString();

    await admin()
      .from('ingestion_runs')
      .update({
        status: resolved,
        finished_at: finishedAt,
        records_fetched: this.counters.fetched,
        records_created: this.counters.created,
        records_updated: this.counters.updated,
        records_skipped: this.counters.skipped,
        error_count: this.errors,
        summary: this.summary,
      })
      .eq('id', this.id);

    await admin()
      .from('ingestion_jobs')
      .update({ last_run_at: finishedAt, last_status: resolved })
      .eq('key', this.jobKey);
  }

  /** Runs `body`, guaranteeing the run is closed even when it throws. */
  static async wrap<T>(
    jobKey: string,
    opts: { providerCode?: string; params?: Record<string, unknown> },
    body: (run: IngestionRun) => Promise<T>,
  ): Promise<T> {
    const run = await IngestionRun.start(jobKey, opts);
    try {
      const result = await body(run);
      await run.finish('SUCCESS');
      return result;
    } catch (err) {
      await run.fail('run', null, err instanceof Error ? err.message : String(err));
      await run.finish('FAILED');
      throw err;
    }
  }
}
