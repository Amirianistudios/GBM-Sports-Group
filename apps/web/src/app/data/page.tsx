import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Data & providers status.
 * Honest about what is connected and what is not: a scouting platform that
 * overstates its coverage is worse than one with gaps.
 */
export default async function DataPage() {
  const supabase = await createClient();

  const [{ data: providers }, { data: jobs }, { data: runs }, counts] = await Promise.all([
    supabase.from('data_providers').select('*').order('default_priority', { ascending: false }),
    supabase.from('ingestion_jobs').select('*').order('key'),
    supabase.from('ingestion_runs').select('*').order('started_at', { ascending: false }).limit(10),
    (async () => {
      const tables = ['players', 'clubs', 'competitions', 'market_values', 'transfers',
                      'contracts', 'representation_records', 'player_external_ids',
                      'source_facts', 'discovery_signals'] as const;
      const results = await Promise.all(
        tables.map((t) => supabase.from(t).select('*', { count: 'exact', head: true })),
      );
      return tables.map((t, i) => ({ table: t, count: results[i].count ?? 0 }));
    })(),
  ]);

  // Which providers have actually produced data, as opposed to merely existing.
  const { data: activeProviders } = await supabase
    .from('player_external_ids')
    .select('provider_code');
  const withData = new Set((activeProviders ?? []).map((r) => r.provider_code));

  return (
    <AppShell eyebrow="System" title="Data & providers">
      <section className="px-4 md:px-6 pt-3">
        <h2 className="text-sm font-semibold tracking-tight mb-2">Record counts</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {counts.map((c) => (
            <div key={c.table} className="surface p-3">
              <div className="data text-xl font-semibold leading-none">{c.count.toLocaleString()}</div>
              <div className="eyebrow mt-1.5">{c.table.replaceAll('_', ' ')}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <div className="px-4 md:px-6 mb-1.5">
          <h2 className="text-sm font-semibold tracking-tight">Providers</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Connected means GBM holds data from this source right now.
          </p>
        </div>
        <div className="surface mx-4 md:mx-6 overflow-hidden">
          {(providers ?? []).map((p) => {
            const connected = withData.has(p.code);
            return (
              <div key={p.code} className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{p.name}</span>
                    <span className={`badge ${connected ? 'badge-verified' : p.requires_credentials ? 'badge-attention' : 'badge-neutral'}`}>
                      {connected ? 'Connected' : p.requires_credentials ? 'Needs credentials' : 'Not connected'}
                    </span>
                  </div>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
                    {p.notes}
                  </p>
                </div>
                <span className="data text-xs shrink-0" style={{ color: 'var(--muted)' }}>
                  {p.kind}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <div className="px-4 md:px-6 mb-1.5">
          <h2 className="text-sm font-semibold tracking-tight">Ingestion jobs</h2>
        </div>
        <div className="surface mx-4 md:mx-6 overflow-hidden">
          {(jobs ?? []).map((j) => (
            <div key={j.key} className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <span className="data text-sm font-semibold">{j.key}</span>
                <span className="badge badge-neutral">{j.last_status ?? 'never run'}</span>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                {j.description} {j.schedule_cron && <span className="data">· {j.schedule_cron}</span>}
              </p>
            </div>
          ))}
        </div>
      </section>

      {(runs ?? []).length > 0 && (
        <section className="mt-6">
          <div className="px-4 md:px-6 mb-1.5">
            <h2 className="text-sm font-semibold tracking-tight">Recent runs</h2>
          </div>
          <div className="surface mx-4 md:mx-6 overflow-hidden">
            {(runs ?? []).map((r) => (
              <div key={r.id} className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="data text-xs">{r.job_key}</span>
                <span className="data text-xs" style={{ color: 'var(--muted)' }}>
                  {r.status} · {formatDate(r.started_at)} · {r.records_created} created
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="h-8" />
    </AppShell>
  );
}
