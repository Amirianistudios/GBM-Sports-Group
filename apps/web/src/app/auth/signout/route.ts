import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env';

/**
 * SIGN OUT.
 *
 * Two things have to be true for this to work, and the first one is easy to
 * get wrong: the middleware has to let the request reach this handler at all.
 * `/auth/signout` sits under `/auth`, so it matches the auth-route prefix, and
 * the "an authenticated user on an auth route goes home" rule bounced the POST
 * to `/` with a 307 before any of this ran. Sign out appeared to do nothing
 * because it genuinely did nothing. `isSignOutRoute` in lib/auth-flow.ts is
 * the fix, and its tests pin it.
 *
 * The second is that the cleared cookies must land on the response that is
 * actually returned. A redirect is a *new* response object, so rather than
 * mutating the request's cookie store and trusting the framework to merge
 * those mutations across, the response is built first and Supabase writes
 * directly onto it. What the browser receives is then exactly what was set.
 *
 * Sign-out is also deliberately total: if the network call to revoke the token
 * fails, the local session cookies are still cleared and the user still lands
 * on /login. A sign-out that leaves someone signed in because a request
 * timed out is the failure mode worth designing against — on a shared machine
 * it is a security problem, not an inconvenience.
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.url), { status: 303 });

  let url: string;
  let key: string;
  try {
    url = supabaseUrl();
    key = supabaseAnonKey();
  } catch {
    // Configuration is broken, so no session can be verified anyway. Clear
    // what the browser holds and send them to /login regardless.
    clearAuthCookies(request, response);
    return response;
  }

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    // Default scope, as before: the refresh token is revoked server-side, so
    // the session cannot be resurrected from a copied cookie. Whether that
    // succeeds does not decide whether the user gets signed out of this
    // browser — the cookie clear below is unconditional.
    await supabase.auth.signOut();
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    console.error(`[signout] revoke failed, clearing local session anyway — ${name}`);
  }

  // Belt and braces: whatever the SDK did or did not manage to expire, no
  // Supabase auth cookie survives this response.
  clearAuthCookies(request, response);
  return response;
}

/**
 * Expire every Supabase auth cookie on the request. The session cookie is
 * named for the project ref (`sb-<ref>-auth-token`) and is chunked into
 * `.0`, `.1`… suffixes once it exceeds the 4KB cookie limit — which it does,
 * since the session carries the user object. Matching on the prefix removes
 * the chunks too; deleting only the base name would leave a partial session
 * behind for the middleware to trip over.
 */
function clearAuthCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-')) {
      response.cookies.set(cookie.name, '', { path: '/', maxAge: 0 });
    }
  }
}
