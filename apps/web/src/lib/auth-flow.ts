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

  if (!input.authenticated && !input.isAuthRoute) return { kind: 'redirect-login' };
  if (input.authenticated && input.isAuthRoute) return { kind: 'redirect-home' };
  return { kind: 'continue' };
}
