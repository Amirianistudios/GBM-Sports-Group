import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { freshness } from '@/lib/freshness';

export const dynamic = 'force-dynamic';

/**
 * SYNC STATUS — is the machinery actually alive?
 *
 * Everything here is read from ingestion_runs, which every job opens and
 * closes whether it succeeds or throws. That is the point: a job that died
 * halfway still leaves a row saying so, and a job that has never run shows an
 * honest absence rather than a comforting blank.
 */

interface Run {
  job_key: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  records_fetched: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  error_count: number;
  triggered_by: string | null;
  summary: Record<string, unknown> | null;
}

const JOBS: { key: string; title: string; cadence: string }[] = [
  { key: 'hourly_intelligence', title: 'Hourly intelligence', cadence: 'Every hour at :10 (GitHub Actions)' },
  { key: 'transfermarkt_dataset_update', title: 'Dataset refresh', cadence: 'Weekly, Wednesday 03:00 UTC' },
  { key: 'entity_resolution', title: 'Reep identity resolution', cadence: 'With every dataset refresh' },
  { key: 'discovery_signals', title: 'Discovery signals', cadence: 'With every dataset refresh' },
];

function nextHourlyRun(): string {
  const d = new Date();
  d.setUTCMinutes(10, 0, 0);
  if (d.getTime() <= Date.now()) d.setUTCHours(d.getUTCHours() + 1);
  return d.toLocaleString('en-GB', { timeStyle: 'short', dateStyle: 'medium', timeZone: 'UTC' }) + ' UTC';
}

export default async function SyncStatusPage() {
  const supabase = await createClient();

  const [
    { data: runs, error },
    { count: tracked },
    { count: newsCount },
    { data: agents, error: agentsError },
    { data: submissions },
  ] = await Promise.all([
    supabase
      .from('ingestion_runs')
      .select(
        'job_key, status, started_at, finished_at, records_fetched, records_created, ' +
          'records_updated, records_skipped, error_count, triggered_by, summary',
      )
      .order('started_at', { ascending: false })
      .limit(60),
    supabase.from('gbm_portfolio').select('player_id', { count: 'exact', head: true }),
    supabase.from('player_news').select('id', { count: 'exact', head: true }),

    // The external intelligence path is an ingestion path, so it is held to
    // the same rule as the rest: every attempt is recorded and shown. Without
    // this, an agent whose submissions are all being rejected looks exactly
    // like an agent that has sent nothing.
    supabase
      .from('intel_agents')
      .select('agent_code, display_name, is_active, scopes, last_seen_at')
      .order('agent_code'),
    supabase
      .from('intel_submissions')
      .select('id, kind, status, error, received_at')
      .order('received_at', { ascending: false })
      .limit(25),
  ]);

  if (error) console.error(`[sync] runs read failed — ${error.message}`);
  const all = (runs ?? []) as unknown as Run[];
  const latestOf = (key: string) => all.find((r) => r.job_key === key) ?? null;

  return (
    <AppShell eyebrow="Organization" title="Sync status">
      <p className="px-4 md:px-6 pt-2 text-xs leading-relaxed max-w-2xl" style={{ color: 'var(--muted)' }}>
        Every ingestion job opens a row before it works and closes it even when it throws, so this
        page shows what actually happened rather than what was scheduled.
      </p>

      <section className="px-4 md:px-6 mt-4 grid gap-3 md:grid-cols-2">
        {JOBS.map((job) => {
          const run = latestOf(job.key);
          return <JobCard key={job.key} job={job} run={run} />;
        })}
      </section>

      <section className="px-4 md:px-6 mt-5">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight mb-2">Scope</h2>
        <div className="card p-4 grid grid-cols-3 gap-4">
          <Stat label="Portfolio players" value={tracked ?? 0} />
          <Stat label="News items stored" value={newsCount ?? 0} />
          <Stat label="Next hourly run" value={nextHourlyRun()} small />
        </div>
      </section>

      <section className="px-4 md:px-6 mt-5">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight mb-2">External intelligence</h2>
        <div className="card overflow-hidden">
          {agentsError ? (
            // "None registered" is a claim about the world. A read that failed
            // cannot support it, and this page exists to distinguish the two.
            <p className="p-4 text-sm" style={{ color: '#E0705B' }}>
              Could not read the agent register — {agentsError.message}
            </p>
          ) : (agents ?? []).length === 0 ? (
            <p className="p-4 text-sm" style={{ color: 'var(--muted)' }}>
              No research agent is registered. See docs/AVENGERS_INTEL_CONTRACT.md to issue one.
            </p>
          ) : (
            (agents ?? []).map((a) => (
              <div
                key={a.agent_code}
                className="px-4 py-2.5 flex items-center gap-3"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <StatusDot status={a.is_active ? 'SUCCESS' : 'FAILED'} />
                <span className="text-sm font-medium flex-1 truncate">
                  {a.display_name}
                  {/* The dot is decorative, so "disabled" is said in words too. */}
                  {!a.is_active && <span className="badge badge-neutral ml-2">disabled</span>}
                  <span className="data text-xs ml-2" style={{ color: 'var(--muted)' }}>
                    {/* An empty scopes array means every kind is permitted. */}
                    {(a.scopes ?? []).length > 0 ? (a.scopes ?? []).join(', ') : 'all kinds'}
                  </span>
                </span>
                <span className="data text-xs w-32 text-right" style={{ color: 'var(--muted)' }}>
                  {a.last_seen_at ? freshness(a.last_seen_at, { verb: '' }).label.trim() : 'never seen'}
                </span>
              </div>
            ))
          )}

          {(submissions ?? []).length > 0 && (
            <>
              <p className="px-4 pt-3 pb-1 eyebrow">Last {(submissions ?? []).length} submissions</p>
              {(submissions ?? []).map((s) => (
                <div
                  key={s.id}
                  className="px-4 py-2 flex items-center gap-3"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  {/* DUPLICATE is neither success nor failure — a safe retry —
                      so it falls through to the neutral dot. */}
                  <StatusDot
                    status={
                      s.status === 'ACCEPTED'
                        ? 'SUCCESS'
                        : s.status === 'DUPLICATE'
                          ? 'DUPLICATE'
                          : 'FAILED'
                    }
                  />
                  <span className="text-sm flex-1 truncate">
                    {s.kind}
                    {/* The reason a submission was refused is the whole value of
                        showing it — a bare count would hide a broken payload. */}
                    {s.error && (
                      <span className="data text-xs ml-2" style={{ color: '#E0705B' }}>{s.error}</span>
                    )}
                  </span>
                  <span className="data text-xs w-32 text-right" style={{ color: 'var(--muted)' }}>
                    {freshness(s.received_at, { verb: '' }).label.trim()}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      <section className="px-4 md:px-6 mt-5">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight mb-2">Recent runs</h2>
        <div className="card overflow-hidden">
          {all.length === 0 ? (
            <p className="p-4 text-sm" style={{ color: 'var(--muted)' }}>
              No ingestion runs recorded yet.
            </p>
          ) : (
            all.slice(0, 25).map((r, i) => (
              <div
                key={`${r.job_key}-${r.started_at}-${i}`}
                className="px-4 py-2.5 flex items-center gap-3"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <StatusDot status={r.status} />
                <span className="text-sm font-medium flex-1 truncate">{r.job_key}</span>
                <span className="data text-xs" style={{ color: 'var(--muted)' }}>
                  {r.records_created}c / {r.records_updated}u
                  {r.error_count > 0 && (
                    <span style={{ color: '#E0705B' }}> · {r.error_count} err</span>
                  )}
                </span>
                <span className="data text-xs w-32 text-right" style={{ color: 'var(--muted)' }}>
                  {freshness(r.started_at, { verb: '' }).label.trim()}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
      <div className="h-8" />
    </AppShell>
  );
}

function JobCard({
  job,
  run,
}: {
  job: { key: string; title: string; cadence: string };
  run: Run | null;
}) {
  const f = run ? freshness(run.started_at, { verb: 'Last run' }) : null;
  const summary = (run?.summary ?? {}) as Record<string, unknown>;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{job.title}</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            {job.cadence}
          </p>
        </div>
        {run ? <StatusBadge status={run.status} /> : <span className="badge badge-neutral">Never run</span>}
      </div>

      {run ? (
        <>
          <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
            {f?.label}
            {run.finished_at
              ? ` · took ${Math.max(
                  1,
                  Math.round((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000),
                )}s`
              : ' · still running'}
            {run.triggered_by ? ` · ${run.triggered_by}` : ''}
          </p>
          <div className="grid grid-cols-4 gap-2 mt-3">
            <Stat label="Seen" value={run.records_fetched} small />
            <Stat label="New" value={run.records_created} small />
            <Stat label="Updated" value={run.records_updated} small />
            <Stat label="Errors" value={run.error_count} small alert={run.error_count > 0} />
          </div>
          {typeof summary.skipped_inside_interval === 'number' && (
            <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
              {String(summary.skipped_inside_interval)} player(s) skipped — still inside their check
              interval, which is how the hourly cadence stays inexpensive.
            </p>
          )}
        </>
      ) : (
        <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
          This job has not run yet. Nothing is stale — there is simply nothing recorded.
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'SUCCESS'
      ? 'badge-verified'
      : status === 'FAILED'
        ? 'badge-conflict'
        : status === 'PARTIAL'
          ? 'badge-attention'
          : 'badge-neutral';
  return <span className={`badge ${cls}`}>{status.toLowerCase()}</span>;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'SUCCESS'
      ? 'var(--color-verified)'
      : status === 'FAILED'
        ? 'var(--color-conflict)'
        : status === 'PARTIAL'
          ? 'var(--color-attention)'
          : 'var(--muted)';
  return (
    <span
      aria-hidden="true"
      className="w-1.5 h-1.5 rounded-full shrink-0"
      style={{ background: color }}
    />
  );
}

function Stat({
  label,
  value,
  small,
  alert,
}: {
  label: string;
  value: number | string;
  small?: boolean;
  alert?: boolean;
}) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p
        className={`data font-semibold ${small ? 'text-sm' : 'text-lg'}`}
        style={alert ? { color: '#E0705B' } : undefined}
      >
        {typeof value === 'number' ? value.toLocaleString('en-GB') : value}
      </p>
    </div>
  );
}
