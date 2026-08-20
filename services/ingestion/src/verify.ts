/**
 * End-to-end verification — encodes the platform's success criterion as an
 * executable check: at least one real player must exist in Supabase with
 * identity, multi-provider external ids, club, position, market information
 * and season statistics, with transfer history where available.
 *
 * Run after an import (locally, in the rehearsal stack, and as the last step
 * of the scheduled workflow). Exits non-zero when the criterion fails, so
 * automation treats a hollow import as a failure rather than a success.
 */
import { admin, selectAll } from './supabase.js';

export interface VerifyReport {
  ok: boolean;
  counts: Record<string, number>;
  exemplar: {
    playerId: string;
    fullName: string;
    club: boolean;
    position: boolean;
    dateOfBirth: boolean;
    externalIdProviders: number;
    marketValues: number;
    seasonStats: number;
    transfers: number;
  } | null;
  detail: string;
}

async function countOf(table: string, refine?: (q: any) => any): Promise<number> {
  let q = admin().from(table).select('*', { count: 'exact', head: true });
  if (refine) q = refine(q);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: count failed — ${error.message}`);
  return count ?? 0;
}

export async function verifyEndToEnd(log: (m: string) => void = console.log): Promise<VerifyReport> {
  const counts: Record<string, number> = {};
  for (const t of [
    'players',
    'player_external_ids',
    'clubs',
    'market_values',
    'transfers',
    'player_season_stats',
    'seasons',
    'ingestion_runs',
  ]) {
    counts[t] = await countOf(t);
  }
  counts['reep_v1_identities'] = await countOf('player_external_ids', (q) =>
    q.eq('provider_code', 'REEP').eq('namespace', 'v1'),
  );

  log('Row counts');
  for (const [t, n] of Object.entries(counts)) log(`  ${t.padEnd(24)} ${String(n).padStart(9)}`);
  log('');

  // Candidates: players that have season statistics — the criterion's rarest
  // ingredient — checked one by one until one satisfies everything.
  const statRows = await selectAll<{ player_id: string }>(
    'player_season_stats',
    'player_id',
    (q) => q.limit(400),
    400,
  );
  const candidates = [...new Set(statRows.map((r) => r.player_id))].slice(0, 25);

  let exemplar: VerifyReport['exemplar'] = null;
  for (const id of candidates) {
    const { data: p, error } = await admin()
      .from('players')
      .select('id, full_name, date_of_birth, primary_position, current_club_id')
      .eq('id', id)
      .single();
    if (error || !p) continue;

    const providers = await selectAll<{ provider_code: string }>(
      'player_external_ids',
      'provider_code',
      (q) => q.eq('player_id', id),
    );
    const distinctProviders = new Set(providers.map((r) => r.provider_code)).size;
    const marketValues = await countOf('market_values', (q) => q.eq('player_id', id));
    const seasonStats = await countOf('player_season_stats', (q) => q.eq('player_id', id));
    const transfers = await countOf('transfers', (q) => q.eq('player_id', id));

    const candidate = {
      playerId: id,
      fullName: p.full_name as string,
      club: Boolean(p.current_club_id),
      position: Boolean(p.primary_position),
      dateOfBirth: Boolean(p.date_of_birth),
      externalIdProviders: distinctProviders,
      marketValues,
      seasonStats,
      transfers,
    };

    const passes =
      candidate.club &&
      candidate.position &&
      candidate.dateOfBirth &&
      candidate.externalIdProviders >= 2 &&
      candidate.marketValues > 0 &&
      candidate.seasonStats > 0;

    if (passes) {
      exemplar = candidate;
      break;
    }
    exemplar = exemplar ?? candidate; // keep the first as diagnostic if none pass
  }

  const ok = Boolean(
    exemplar &&
      exemplar.club &&
      exemplar.position &&
      exemplar.dateOfBirth &&
      exemplar.externalIdProviders >= 2 &&
      exemplar.marketValues > 0 &&
      exemplar.seasonStats > 0,
  );

  let detail: string;
  if (!candidates.length) {
    detail = 'no player has season statistics yet — the import has not produced statistics';
  } else if (!ok) {
    detail = `no candidate satisfied every criterion (best: ${JSON.stringify(exemplar)})`;
  } else {
    detail =
      `${exemplar!.fullName}: ${exemplar!.externalIdProviders} providers, ` +
      `${exemplar!.marketValues} valuations, ${exemplar!.seasonStats} stat rows, ` +
      `${exemplar!.transfers} transfers`;
  }

  log(ok ? `PASS  ${detail}` : `FAIL  ${detail}`);
  return { ok, counts, exemplar, detail };
}
