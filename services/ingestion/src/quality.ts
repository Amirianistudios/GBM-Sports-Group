/**
 * Data quality checks.
 *
 * These answer the question a scout will eventually ask out loud: "can I
 * trust this screen?" Each check reports a count and a verdict; none of them
 * mutate data.
 */
import { admin } from './supabase.js';

export interface Check {
  name: string;
  detail: string;
  count: number;
  ok: boolean;
}

async function count(table: string, refine?: (q: any) => any): Promise<number> {
  let q = admin().from(table).select('*', { count: 'exact', head: true });
  if (refine) q = refine(q);
  const { count: n, error } = await q;
  if (error) throw new Error(`${table}: count failed — ${error.message}`);
  return n ?? 0;
}

export async function runQualityChecks(): Promise<Check[]> {
  const checks: Check[] = [];

  const players = await count('players');
  checks.push({
    name: 'players present',
    detail: 'canonical player rows',
    count: players,
    ok: players > 0,
  });

  const noDob = await count('players', (q) => q.is('date_of_birth', null));
  checks.push({
    name: 'players missing date of birth',
    detail: 'DOB is the strongest entity-resolution key; missing values weaken matching',
    count: noDob,
    ok: players === 0 || noDob / players < 0.05,
  });

  const orphanIds = await count('player_external_ids', (q) => q.is('player_id', null));
  checks.push({
    name: 'orphaned external ids',
    detail: 'external ids not attached to a player',
    count: orphanIds,
    ok: orphanIds === 0,
  });

  const noClub = await count('players', (q) => q.is('current_club_id', null));
  checks.push({
    name: 'players without a current club',
    detail: 'expected for retired and free-agent players',
    count: noClub,
    ok: true,
  });

  const transfers = await count('transfers');
  checks.push({
    name: 'transfers present',
    detail: 'transfer history backs the player profile timeline',
    count: transfers,
    ok: transfers > 0,
  });

  const unmappedTransferClubs = await count('transfers', (q) =>
    q.is('from_club_id', null).not('from_club_name_raw', 'is', null),
  );
  checks.push({
    name: 'transfers with unmapped origin club',
    detail: 'club named by the source but not present in GBM; raw name retained',
    count: unmappedTransferClubs,
    ok: true,
  });

  const values = await count('market_values');
  checks.push({
    name: 'market valuations present',
    detail: 'valuation history drives value-trend signals',
    count: values,
    ok: values > 0,
  });

  const staleRepresentation = await count('representation_records', (q) =>
    q.eq('is_current', true).lt('retrieved_at', new Date(Date.now() - 90 * 864e5).toISOString()),
  );
  checks.push({
    name: 'representation older than 90 days',
    detail: 'agency data ages quickly and drives outreach decisions',
    count: staleRepresentation,
    ok: true,
  });

  const failedRuns = await count('ingestion_runs', (q) => q.eq('status', 'FAILED'));
  checks.push({
    name: 'failed ingestion runs',
    detail: 'runs that ended in an unrecovered error',
    count: failedRuns,
    ok: failedRuns === 0,
  });

  return checks;
}
