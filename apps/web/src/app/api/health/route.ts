import { NextResponse } from 'next/server';
import { checkSupabaseAnonKey, checkSupabaseUrl } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

/**
 * Deployment health, safely. Reports whether the application is up, whether
 * its Supabase configuration is structurally sound, and whether the Supabase
 * auth service answers — status and variable NAMES only. No key material, no
 * user information, no football data; the middleware excludes this route so
 * health stays checkable even when authentication is down.
 */
export async function GET() {
  // Literal indexing — Next.js inlines NEXT_PUBLIC_* at build time.
  const url = checkSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = checkSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const faults = [url, key].filter((c): c is { ok: false; reason: string } => !c.ok);
  const supabaseConfig = faults.length === 0 ? 'ok' : faults.map((f) => f.reason).join(' ');

  let supabaseReachable = false;
  if (url.ok && key.ok) {
    try {
      const probe = await fetch(`${url.value}/auth/v1/health`, {
        headers: { apikey: key.value },
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      });
      supabaseReachable = probe.ok;
    } catch {
      supabaseReachable = false;
    }
  }

  return NextResponse.json(
    { application: 'ok', supabaseConfig, supabaseReachable },
    { headers: { 'cache-control': 'no-store' } },
  );
}
