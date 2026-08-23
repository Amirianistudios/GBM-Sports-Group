/**
 * The complete routing policy of the auth middleware, as a pure function.
 *
 * Every possible input maps to an explicit outcome — there is no path on
 * which an expected configuration or auth-backend failure can escape as an
 * uncaught exception (which Vercel renders as a bare, undiagnosable
 * "Internal Server Error"). The proxy is a thin shell around this; the test
 * suite exercises the policy exhaustively.
 */

export interface AuthFlowInput {
  /** Request is for /login or /auth — the unauthenticated surface. */
  isAuthRoute: boolean;
  /**
   * Request is for /auth/signout, the one auth route that exists to be reached
   * *while signed in*. It sits under /auth, so it is an auth route by prefix,
   * and the "authenticated user on an auth route goes home" rule would bounce
   * it to / before the handler could clear the session cookie — which is
   * precisely what made Sign out appear to do nothing.
   */
  isSignOutRoute: boolean;
  /** Named configuration fault from env validation, or null when config is sound. */
  configError: string | null;
  /** Whether Supabase client construction + getUser() completed without throwing. */
  authBackend: 'ok' | 'failed';
  /** A verified user is present on the request. */
  authenticated: boolean;
}

export type AuthFlowOutcome =
  | { kind: 'config-error'; message: string }
  | { kind: 'service-error' }
  | { kind: 'redirect-login' }
  | { kind: 'redirect-home' }
  | { kind: 'continue' };

export function decideAuthFlow(input: AuthFlowInput): AuthFlowOutcome {
  if (input.configError) {
    return { kind: 'config-error', message: input.configError };
  }

  if (input.authBackend === 'failed') {
    // The login surface still renders, so the outage is visible and the
    // sign-in form's own error handling takes over. Protected routes return
    // an explicit service error — authentication cannot be verified, so
    // nothing protected may render, but the failure must say what it is.
    return input.isAuthRoute ? { kind: 'continue' } : { kind: 'service-error' };
  }

  // Sign out is always allowed to run. Signed in, it clears the session;
  // signed out, it is a harmless no-op that redirects to /login. Bouncing it
  // either way would strand the user in the session they asked to leave.
  if (input.isSignOutRoute) return { kind: 'continue' };

  if (!input.authenticated && !input.isAuthRoute) return { kind: 'redirect-login' };
  if (input.authenticated && input.isAuthRoute) return { kind: 'redirect-home' };
  return { kind: 'continue' };
}
