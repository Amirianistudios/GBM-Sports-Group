import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env';

/**
 * Refreshes the Supabase session on every request and gates the whole app
 * behind authentication. GBM Intelligence has no public surface — there is no
 * public player database.
 */
export async function proxy(request: NextRequest) {
  // Resolve configuration before anything else, and fail legibly: an
  // uncaught throw here renders as a bare "Internal Server Error" on every
  // route, which is undiagnosable from a browser. A missing variable is a
  // deployment-configuration fault and should say so — by name, never by
  // value.
  let supabaseApiUrl: string;
  let anonKey: string;
  try {
    supabaseApiUrl = supabaseUrl();
    anonKey = supabaseAnonKey();
  } catch (error) {
    return new NextResponse(
      `Deployment configuration error.\n\n${error instanceof Error ? error.message : 'Supabase connection settings could not be resolved.'}\n\nNo data is exposed by this page. Fix the deployment environment and redeploy.`,
      { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseApiUrl,
    anonKey,
    {
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
    },
  );

  // getUser() revalidates the token with Supabase; getSession() would trust
  // a cookie the client could have tampered with.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login')
    || request.nextUrl.pathname.startsWith('/auth');

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
