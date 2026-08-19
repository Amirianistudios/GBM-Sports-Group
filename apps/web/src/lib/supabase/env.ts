/**
 * Supabase connection settings for the browser and server clients.
 *
 * Read lazily, never at module scope: a throw during module evaluation would
 * fail the Next.js build itself, turning a missing deployment variable into an
 * opaque build error instead of a legible runtime one.
 *
 * Both values are public by design — the anon key is safe in the browser
 * because every query is constrained by row-level security. The service role
 * key is never referenced here and must never reach client code.
 */
function required(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  // Next.js inlines NEXT_PUBLIC_* at build time, so these must be indexed
  // literally rather than through a variable.
  const value =
    name === 'NEXT_PUBLIC_SUPABASE_URL'
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!value) {
    throw new Error(
      `${name} is not set. Add it to the deployment environment ` +
        `(Vercel → Project → Settings → Environment Variables) and to .env.local for local development.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required('NEXT_PUBLIC_SUPABASE_URL');
}

export function supabaseAnonKey(): string {
  return required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}
