/**
 * Server-side Supabase client for ingestion.
 *
 * Uses the service role key, which bypasses RLS. This client must never be
 * constructed in browser or edge code that a user can reach — ingestion runs
 * only from the CLI, CI and scheduled jobs.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { optionalEnv, requireEnv } from './env.js';

export type Db = SupabaseClient<any, 'public', any>;

let client: Db | undefined;

export function admin(): Db {
  if (client) return client;

  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  // Supabase issues both legacy `service_role` JWTs and newer `sb_secret_…`
  // keys. Accept either so the project works before and after key rotation.
  const key =
    optionalEnv('SUPABASE_SERVICE_ROLE_KEY') ??
    optionalEnv('SUPABASE_SECRET_KEY') ??
    (() => {
      throw new Error(
        'Missing service role credentials.\n' +
          'Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in .env.local.\n' +
          'Find it in the Supabase dashboard under Project Settings → API Keys.\n' +
          'This key bypasses RLS — never expose it through a NEXT_PUBLIC_ variable.',
      );
    })();

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });
  return client;
}

/**
 * Inserts rows in chunks, because a single request carrying 600k rows will be
 * rejected long before Postgres sees it.
 *
 * `onConflict` maps to Postgres ON CONFLICT DO UPDATE; without it duplicate
 * keys raise. `ignoreDuplicates` turns it into DO NOTHING, which is what
 * append-only history tables want.
 */
export async function upsertChunked<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  opts: { chunk?: number; onConflict?: string; ignoreDuplicates?: boolean; label?: string } = {},
): Promise<number> {
  const size = opts.chunk ?? 1000;
  let written = 0;

  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    const query = admin().from(table);
    const { error } = opts.onConflict
      ? await query.upsert(slice as never, {
          onConflict: opts.onConflict,
          ignoreDuplicates: opts.ignoreDuplicates ?? false,
        })
      : await query.insert(slice as never);

    if (error) {
      throw new Error(
        `${opts.label ?? table}: write failed at rows ${i}-${i + slice.length} — ${error.message}`,
      );
    }
    written += slice.length;
  }
  return written;
}

/**
 * Reads an entire table with pagination. Supabase caps a single response
 * (1000 rows by default), so anything that must be complete — such as the
 * external-id map the importer reconciles against — has to page explicitly.
 */
export async function selectAll<T>(
  table: string,
  columns: string,
  refine?: (q: any) => any,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = admin().from(table).select(columns).range(from, from + pageSize - 1);
    if (refine) query = refine(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: read failed — ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return out;
}
