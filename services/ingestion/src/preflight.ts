/**
 * Preflight — answers "will an ingestion run even start?" in seconds, before
 * anything is downloaded or written. Run automatically at the head of
 * data:update and as the first step of the scheduled workflow, so a missing
 * secret or a schema drift fails fast with a named cause instead of half-way
 * through a 200 MB import.
 */
import { hasEnv } from './env.js';
import { admin } from './supabase.js';
import { R2_BASE } from './dataset.js';

export interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** Tables every pipeline stage assumes. Cheap HEAD selects, no data read. */
const REQUIRED_TABLES = [
  'players',
  'player_external_ids',
  'clubs',
  'competitions',
  'seasons',
  'player_season_stats',
  'market_values',
  'transfers',
  'contracts',
  'representation_records',
  'ingestion_runs',
  'ingestion_errors',
  'data_providers',
];

const REEP_LATEST = 'https://data.reep.football/releases/latest.json';

export async function runPreflight(opts: { offline?: boolean } = {}): Promise<PreflightCheck[]> {
  const checks: PreflightCheck[] = [];

  // 1. Credentials present — names only, values never surfaced.
  const hasUrl = hasEnv('NEXT_PUBLIC_SUPABASE_URL');
  const hasKey = hasEnv('SUPABASE_SERVICE_ROLE_KEY') || hasEnv('SUPABASE_SECRET_KEY');
  checks.push({
    name: 'credentials',
    ok: hasUrl && hasKey,
    detail:
      hasUrl && hasKey
        ? 'NEXT_PUBLIC_SUPABASE_URL and a service key are set'
        : `missing: ${[
            !hasUrl && 'NEXT_PUBLIC_SUPABASE_URL',
            !hasKey && 'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)',
          ]
            .filter(Boolean)
            .join(', ')}`,
  });
  if (!hasUrl || !hasKey) return checks; // nothing below can run

  // 2. Database reachable and schema shaped as the pipeline expects.
  for (const table of REQUIRED_TABLES) {
    try {
      const { error } = await admin().from(table).select('*', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      checks.push({ name: `table ${table}`, ok: true, detail: 'reachable' });
    } catch (err) {
      checks.push({
        name: `table ${table}`,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3. Provider registry seeded — the FK every write depends on.
  try {
    const { data, error } = await admin()
      .from('data_providers')
      .select('code')
      .in('code', ['TRANSFERMARKT_DATASET', 'REEP']);
    if (error) throw new Error(error.message);
    const found = new Set((data ?? []).map((r) => r.code as string));
    const ok = found.has('TRANSFERMARKT_DATASET') && found.has('REEP');
    checks.push({
      name: 'provider registry',
      ok,
      detail: ok
        ? 'TRANSFERMARKT_DATASET and REEP registered'
        : 'rls_and_seed migration has not been applied — provider rows missing',
    });
  } catch (err) {
    checks.push({
      name: 'provider registry',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // 4. Upstream sources reachable (HEAD/manifest only — no downloads).
  if (!opts.offline) {
    for (const [name, probe] of [
      ['transfermarkt dataset (R2)', () => fetch(`${R2_BASE}/players.csv.gz`, { method: 'HEAD' })],
      ['reep v1 register', () => fetch(REEP_LATEST)],
    ] as const) {
      try {
        const res = await probe();
        checks.push({
          name,
          ok: res.ok,
          detail: res.ok ? `HTTP ${res.status}` : `HTTP ${res.status} ${res.statusText}`,
        });
      } catch (err) {
        checks.push({
          name,
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return checks;
}
