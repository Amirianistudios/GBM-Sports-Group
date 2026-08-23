import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env';
import { decideAuthFlow } from '@/lib/auth-flow';

/**
 * Refreshes the Supabase session on every request and gates the whole app
 * behind authentication. GBM Intelligence has no public surface — there is no
 * public player database.
 *
 * Failure discipline: an uncaught throw here becomes a bare
 * "Internal Server Error" on every route — undiagnosable from a browser and
 * exactly the outage production suffered. So configuration is validated
 * first, the entire Supabase init + token check is contained, and every
 * expected failure maps to an explicit response via the pure policy in
 * lib/auth-flow.ts. Diagnostics log the error class, message and pathname —
 * never environment values, tokens or cookies.
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/auth');
  const isSignOutRoute = pathname === '/auth/signout';

  let configError: string | null = null;
  let supabaseApiUrl = '';
  let anonKey = '';
  try {
    supabaseApiUrl = supabaseUrl();
    anonKey = supabaseAnonKey();
  } catch (error) {
    configError =
      error instanceof Error ? error.message : 'Supabase connection settings could not be resolved.';
  }

  let response = NextResponse.next({ request });
  let authBackend: 'ok' | 'failed' = 'ok';
  let authenticated = false;

  if (!configError) {
    try {
      const supabase = createServerClient(supabaseApiUrl, anonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      });

      // getUser() revalidates the token with Supabase; getSession() would
      // trust a cookie the client could have tampered with.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      authenticated = Boolean(user);
    } catch (error) {
      authBackend = 'failed';
      const name = error instanceof Error ? error.name : 'UnknownError';
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[proxy] auth backend failure on ${pathname} — ${name}: ${message}`);
    }
  }

  const outcome = decideAuthFlow({
    isAuthRoute,
    isSignOutRoute,
    configError,
    authBackend,
    authenticated,
  });

  switch (outcome.kind) {
    case 'config-error':
      return new NextResponse(
        `Deployment configuration error.\n\n${outcome.message}\n\nNo data is exposed by this page. Correct the deployment environment and redeploy.`,
        { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } },
      );

    case 'service-error':
      return new NextResponse(
        'GBM Intelligence is temporarily unable to reach its authentication service. Your account and data are unaffected — please try again shortly.',
        { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '30' } },
      );

    case 'redirect-login': {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }

    case 'redirect-home': {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }

    case 'continue':
      return response;
  }
}

export const config = {
  // /api/health is excluded so deployment health stays checkable even when
  // auth is down; it exposes status booleans only, never data.
  matcher: [
    '/((?!api/health|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
