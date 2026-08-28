import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * DATA QUALITY — the queue that must not grow silently.
 *
 * Every number here is counted by `gbm_data_quality_report()` in the database,
 * so this page and the ingestion workflow read the same answer rather than two
 * implementations that drift.
 *
 * Nothing on this page repairs anything. That is deliberate: the merge defect
 * destroyed data precisely because a function resolved a conflict on its own,
 * without anyone seeing it. A count with a name is more useful than an
 * automatic fix nobody reviewed.
 */

interface Conflict {
  id: string;
  merge_id: string;
  table_name: string;
  constraint_name: string | null;
  payload: Record<string, unknown>;
  reviewed_at: string | null;
  created_at: string;
}

interface RecoveryRow {
  player_id: string;
  full_name: string;
  transfermarkt_id: string | null;
  season_stats: number;
  market_values: number;
  transfers: number;
  contracts: number;
  representation: number;
  raw_payloads: number;
  likely_lost_rows: boolean;
}

/**
 * What each check means, and when a number stops being acceptable. A check
 * with no threshold is informational — `source_records_unlinked` counts raw
 * payloads that were never tied to a player, which is normal for a payload
 * collected before its player existed.
 */
const CHECKS: {
  key: string;
  label: string;
  note: string;
  warnAbove?: number;
  failAbove?: number;
}[] = [
  {
    key: 'duplicate_external_ids',
    label: 'One provider id, several players',
    note: 'The same (provider, namespace, id) points at more than one GBM player. One of them is wrong.',
    warnAbove: 0,
    failAbove: 20,
  },
  {
    key: 'players_sharing_a_provider_id',
    label: 'One player, several ids per provider',
    note: 'A player holds two different ids for the same provider — usually the residue of a merge. Needs a human to pick.',
    warnAbove: 0,
    failAbove: 50,
  },
  {
    key: 'duplicate_players_name_dob',
    label: 'Players sharing name and date of birth',
    note: 'Almost certainly the same person twice. Candidates for gbm_merge_player.',
    warnAbove: 0,
    failAbove: 10,
  },
  {
    key: 'orphan_source_facts',
    label: 'Provenance pointing at a deleted player',
    note: 'source_facts reaches players without a foreign key, so a bad delete can strand it.',
    warnAbove: 0,
    failAbove: 0,
  },
  {
    key: 'cache_name_id_mismatch',
    label: 'Cached league disagrees with cached competition',
    note: 'The name a surface prints and the rating it scores would come from different competitions.',
    warnAbove: 0,
    failAbove: 0,
  },
  {
    key: 'duplicate_current_representation',
    label: 'Two current representation records',
    note: 'A player can only have one current agency position per provider. Two means one is stale.',
    warnAbove: 0,
    failAbove: 40,
  },
  {
    key: 'unresolved_merge_conflicts',
    label: 'Merge conflicts awaiting review',
    note: 'Rows archived during a merge because the survivor already held the same natural key.',
    warnAbove: 0,
    failAbove: 100,
  },
  {
    key: 'merge_survivors_needing_reingest',
    label: 'Merge survivors below population coverage',
    note: 'Players that survived a merge under the defective function and now hold fewer market values and transfers than their peers.',
    warnAbove: 0,
  },
  {
    key: 'players_with_club_outside_their_league',
    label: 'Club country ≠ competition country',
    note: 'Either the club link or the cached competition is wrong.',
    warnAbove: 0,
    failAbove: 25,
  },
  {
    key: 'stats_without_competition',
    label: 'Season stats with no competition',
    note: 'Unattributable to a league, so they cannot inform league strength or percentiles.',
    warnAbove: 0,
    failAbove: 0,
  },
  {
    key: 'contracts_expiring_in_the_past',
    label: 'Active contracts that expired long ago',
    note: 'Marked ACTIVE but expired more than two years back.',
    warnAbove: 0,
    failAbove: 50,
  },
  {
    key: 'market_values_dated_in_the_future',
    label: 'Market values dated in the future',
    note: 'A valuation cannot post-date today.',
    warnAbove: 0,
    failAbove: 0,
  },
  {
    key: 'source_records_unlinked',
    label: 'Raw payloads not tied to a player',
    note: 'Informational: a payload collected before its player was resolved.',
  },
];

function severity(value: number, c: (typeof CHECKS)[number]): 'ok' | 'warn' | 'fail' {
  if (c.failAbove !== undefined && value > c.failAbove) return 'fail';
  if (c.warnAbove !== undefined && value > c.warnAbove) return 'warn';
  return 'ok';
}

const TONE: Record<string, { dot: string; label: string }> = {
  ok: { dot: 'var(--good, #4ade80)', label: 'clear' },
  warn: { dot: 'var(--warn, #fbbf24)', label: 'look' },
  fail: { dot: 'var(--bad, #f87171)', label: 'act' },
};

export default async function DataQualityPage() {
  const supabase = await createClient();

  const [{ data: report, error }, { data: conflicts }, { data: recovery }] = await Promise.all([
    supabase.rpc('gbm_data_quality_report'),
    supabase
      .from('player_merge_conflicts')
      .select('id, merge_id, table_name, constraint_name, payload, reviewed_at, created_at')
      .is('reviewed_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('v_merge_recovery_queue')
      .select(
        'player_id, full_name, transfermarkt_id, season_stats, market_values, transfers, contracts, representation, raw_payloads, likely_lost_rows',
      )
      .order('market_values', { ascending: true })
      .limit(50),
  ]);

  if (error) console.error(`[data-quality] report failed — ${error.message}`);

  const counts = (report ?? {}) as Record<string, number | string>;
  const rows = (conflicts ?? []) as unknown as Conflict[];
  const queue = (recovery ?? []) as unknown as RecoveryRow[];
  const generated = typeof counts.generated_at === 'string' ? counts.generated_at : null;

  const graded = CHECKS.map((c) => {
    const value = Number(counts[c.key] ?? 0);
    return { ...c, value, tone: severity(value, c) };
  });
  const needsAttention = graded.filter((g) => g.tone !== 'ok');

  return (
    <AppShell eyebrow="Organization" title="Data quality">
      <p className="px-4 md:px-6 pt-2 text-xs leading-relaxed max-w-2xl" style={{ color: 'var(--muted)' }}>
        Counted in the database by <code>gbm_data_quality_report()</code>, so this page and the
        ingestion workflow read the same answer. Nothing here repairs anything on its own — the
        merge defect destroyed data because a function resolved a conflict without anyone seeing
        it.
        {generated && <> Last counted {formatDate(generated)}.</>}
      </p>

      {error ? (
        <section className="px-4 md:px-6 mt-4">
          <div className="card p-4 text-sm">
            The quality report could not be read — {error.message}. That is itself a finding: this
            page shows an error rather than an encouraging set of zeroes.
          </div>
        </section>
      ) : (
        <>
          <section className="px-4 md:px-6 mt-4">
            <h2 className="text-[0.9375rem] font-semibold tracking-tight mb-2">
              {needsAttention.length === 0
                ? 'All checks clear'
                : `${needsAttention.length} of ${graded.length} checks want attention`}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {graded.map((g) => (
                <div key={g.key} className="card p-3">
                  <div className="flex items-baseline gap-2">
                    <span
                      aria-hidden
                      className="inline-block rounded-full shrink-0"
                      style={{ width: 8, height: 8, background: TONE[g.tone].dot }}
                    />
                    <span className="text-lg font-semibold tabular-nums">{g.value}</span>
                    <span className="text-[0.7rem] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                      {TONE[g.tone].label}
                    </span>
                  </div>
                  <p className="text-[0.8125rem] font-medium mt-1">{g.label}</p>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--muted)' }}>
                    {g.note}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="px-4 md:px-6 mt-6">
            <h2 className="text-[0.9375rem] font-semibold tracking-tight mb-2">
              Merge conflicts awaiting review
            </h2>
            <p className="text-xs mb-2 max-w-2xl" style={{ color: 'var(--muted)' }}>
              When a merge cannot repoint a row because the survivor already holds the same natural
              key, the whole row is archived here rather than dropped. Each one is the duplicate&apos;s
              version of a fact the survivor already has.
            </p>
            <div className="surface overflow-hidden">
              {rows.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
                  Nothing archived. Every merged row was reassigned.
                </p>
              ) : (
                rows.map((c) => (
                  <div key={c.id} className="sheet-row">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="badge badge-neutral shrink-0">{c.table_name}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.8125rem] truncate">
                          blocked by <code>{c.constraint_name ?? 'an unnamed key'}</code>
                        </p>
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
                          {formatDate(c.created_at)} · {Object.keys(c.payload ?? {}).length} fields
                          retained
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="px-4 md:px-6 mt-6">
            <h2 className="text-[0.9375rem] font-semibold tracking-tight mb-2">
              Merge recovery queue
            </h2>
            <p className="text-xs mb-2 max-w-2xl" style={{ color: 'var(--muted)' }}>
              Players merged under the defective function, which kept no audit — so what it removed
              cannot be listed, only inferred. A player flagged here holds fewer market values and
              transfers than the population average, which is where that defect bit. Recovery is a
              targeted re-import, not a database repair.
            </p>
            <div className="surface overflow-x-auto">
              {queue.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
                  No merges recorded.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs" style={{ color: 'var(--muted)' }}>
                      <th className="text-left font-medium px-4 py-2">Player</th>
                      <th className="text-right font-medium px-2 py-2">Stats</th>
                      <th className="text-right font-medium px-2 py-2">Values</th>
                      <th className="text-right font-medium px-2 py-2">Transfers</th>
                      <th className="text-right font-medium px-2 py-2">Payloads</th>
                      <th className="text-left font-medium px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map((r) => (
                      <tr key={r.player_id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                        <td className="px-4 py-2">
                          <Link href={`/players/${r.player_id}`} className="hover:underline">
                            {r.full_name}
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.season_stats}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.market_values}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.transfers}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.raw_payloads}</td>
                        <td className="px-4 py-2">
                          {r.likely_lost_rows ? (
                            <span className="badge badge-neutral">re-ingest</span>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--muted)' }}>
                              at population level
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
      <div className="h-8" />
    </AppShell>
  );
}
