/**
 * Supabase connection settings for the browser and server clients.
 *
 * Read lazily, never at module scope: a throw during module evaluation would
 * fail the Next.js build itself, turning a missing deployment variable into an
 * opaque build error instead of a legible runtime one.
 *
 * Validation goes beyond presence. Production served a bare 500 from a
 * present-but-malformed URL that only exploded later, inside the Supabase
 * client — so both values are structurally checked here, and every rejection
 * names the variable and the fault WITHOUT ever including the value.
 *
 * Both values are public by design — the anon key is safe in the browser
 * because every query is constrained by row-level security. The service role
 * key is never referenced here, and the key check refuses it outright.
 */

export type EnvCheck = { ok: true; value: string } | { ok: false; reason: string };

const SETTING_HINT =
  'Set it in the deployment environment (Vercel → Project → Settings → ' +
  'Environment Variables, enabled for Production) and in .env.local for ' +
  'local development, then redeploy.';

/** Structural check for NEXT_PUBLIC_SUPABASE_URL. Never echoes the value. */
export function checkSupabaseUrl(raw: string | undefined): EnvCheck {
  if (!raw || raw.trim() === '') {
    return { ok: false, reason: `NEXT_PUBLIC_SUPABASE_URL is not set. ${SETTING_HINT}` };
  }
  const value = raw.trim();
  if (/^["'`]/.test(value) || /["'`]$/.test(value)) {
    return {
      ok: false,
      reason:
        'NEXT_PUBLIC_SUPABASE_URL is present but wrapped in quotation marks — ' +
        'store the bare URL with no quotes, then redeploy.',
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return {
      ok: false,
      reason: 'NEXT_PUBLIC_SUPABASE_URL is present but is not a valid URL.',
    };
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    return {
      ok: false,
      reason:
        'NEXT_PUBLIC_SUPABASE_URL is present but is not an HTTPS URL. ' +
        '(Plain http is allowed only for a local Supabase stack on localhost.)',
    };
  }
  return { ok: true, value };
}

/**
 * Structural check for NEXT_PUBLIC_SUPABASE_ANON_KEY. Accepts the two public
 * key shapes (legacy JWT anon key, new publishable key) and explicitly
 * refuses secret material. Never echoes the value.
 */
export function checkSupabaseAnonKey(raw: string | undefined): EnvCheck {
  if (!raw || raw.trim() === '') {
    return { ok: false, reason: `NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. ${SETTING_HINT}` };
  }
  const value = raw.trim();
  if (/^["'`]/.test(value) || /["'`]$/.test(value)) {
    return {
      ok: false,
      reason:
        'NEXT_PUBLIC_SUPABASE_ANON_KEY is present but wrapped in quotation marks — ' +
        'store the bare key with no quotes, then redeploy.',
    };
  }
  if (value.startsWith('sb_secret_')) {
    return {
      ok: false,
      reason:
        'NEXT_PUBLIC_SUPABASE_ANON_KEY holds a SECRET key. The frontend must use ' +
        'the anon/publishable key; a secret key must never be deployed here.',
    };
  }
  if (value.startsWith('sb_publishable_')) {
    return { ok: true, value };
  }
  if (value.startsWith('eyJ')) {
    const parts = value.split('.');
    if (parts.length !== 3) {
      return {
        ok: false,
        reason:
          'NEXT_PUBLIC_SUPABASE_ANON_KEY looks like an incomplete key — re-copy it ' +
          'from Supabase → Project Settings → API keys.',
      };
    }
    const payload = decodeJwtPayload(parts[1]);
    if (payload === null) {
      return {
        ok: false,
        reason:
          'NEXT_PUBLIC_SUPABASE_ANON_KEY does not decode as a valid key — re-copy it ' +
          'from Supabase → Project Settings → API keys.',
      };
    }
    if (payload.role === 'service_role') {
      return {
        ok: false,
        reason:
          'NEXT_PUBLIC_SUPABASE_ANON_KEY holds the SERVICE-ROLE key, which bypasses ' +
          'row-level security and must never be deployed to the frontend. Replace it ' +
          'with the anon key.',
      };
    }
    return { ok: true, value };
  }
  return {
    ok: false,
    reason: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not a recognised Supabase public key format.',
  };
}

/** Base64url → JSON, tolerant of missing padding. Works in browser, edge and Node. */
function decodeJwtPayload(segment: string): { role?: string } | null {
  const base64 = segment
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(segment.length / 4) * 4, '=');
  try {
    return JSON.parse(atob(base64)) as { role?: string };
  } catch {
    return null;
  }
}

export function supabaseUrl(): string {
  // Next.js inlines NEXT_PUBLIC_* at build time, so these must be indexed
  // literally rather than through a variable.
  const check = checkSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!check.ok) throw new Error(check.reason);
  return check.value;
}

export function supabaseAnonKey(): string {
  const check = checkSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!check.ok) throw new Error(check.reason);
  return check.value;
}
