import { describe, expect, it } from 'vitest';
import { decideAuthFlow, type AuthFlowOutcome } from './auth-flow';

/**
 * Regression suite: no combination of configuration fault, auth-backend
 * failure and authentication state may escape the policy — every input maps
 * to an explicit outcome, so an expected failure can never surface as a bare
 * "Internal Server Error".
 */

const KINDS: AuthFlowOutcome['kind'][] = [
  'config-error',
  'service-error',
  'redirect-login',
  'redirect-home',
  'continue',
];

describe('decideAuthFlow', () => {
  it('maps every possible input to an explicit outcome (no escape hatch)', () => {
    for (const isAuthRoute of [true, false]) {
      for (const isSignOutRoute of [true, false]) {
        for (const configError of [null, 'NEXT_PUBLIC_SUPABASE_URL is not set.']) {
          for (const authBackend of ['ok', 'failed'] as const) {
            for (const authenticated of [true, false]) {
              const outcome = decideAuthFlow({
                isAuthRoute,
                isSignOutRoute,
                configError,
                authBackend,
                authenticated,
              });
              expect(KINDS).toContain(outcome.kind);
            }
          }
        }
      }
    }
  });

  it('a configuration fault returns the named config error on every route', () => {
    for (const isAuthRoute of [true, false]) {
      const outcome = decideAuthFlow({
        isAuthRoute,
        isSignOutRoute: false,
        configError: 'NEXT_PUBLIC_SUPABASE_URL is present but is not a valid URL.',
        authBackend: 'ok',
        authenticated: false,
      });
      expect(outcome).toEqual({
        kind: 'config-error',
        message: 'NEXT_PUBLIC_SUPABASE_URL is present but is not a valid URL.',
      });
    }
  });

  it('an auth-backend failure on a protected route returns an explicit service error, never a bare 500', () => {
    const outcome = decideAuthFlow({
      isAuthRoute: false, isSignOutRoute: false,
      configError: null,
      authBackend: 'failed',
      authenticated: false,
    });
    expect(outcome.kind).toBe('service-error');
  });

  it('an auth-backend failure still lets the login surface render', () => {
    const outcome = decideAuthFlow({
      isAuthRoute: true, isSignOutRoute: false,
      configError: null,
      authBackend: 'failed',
      authenticated: false,
    });
    expect(outcome.kind).toBe('continue');
  });

  it('an unauthenticated visitor renders /login', () => {
    const outcome = decideAuthFlow({
      isAuthRoute: true, isSignOutRoute: false,
      configError: null,
      authBackend: 'ok',
      authenticated: false,
    });
    expect(outcome.kind).toBe('continue');
  });

  it('an unauthenticated visitor on a protected route is redirected to /login', () => {
    const outcome = decideAuthFlow({
      isAuthRoute: false, isSignOutRoute: false,
      configError: null,
      authBackend: 'ok',
      authenticated: false,
    });
    expect(outcome.kind).toBe('redirect-login');
  });

  it('an authenticated user on /login is sent home; on a protected route continues', () => {
    expect(
      decideAuthFlow({ isAuthRoute: true, isSignOutRoute: false, configError: null, authBackend: 'ok', authenticated: true })
        .kind,
    ).toBe('redirect-home');
    expect(
      decideAuthFlow({ isAuthRoute: false, isSignOutRoute: false, configError: null, authBackend: 'ok', authenticated: true })
        .kind,
    ).toBe('continue');
  });

  /**
   * The bug this pins: /auth/signout matches the /auth prefix, so a signed-in
   * user hitting Sign out satisfied "authenticated && isAuthRoute" and was
   * redirected home with a 307 — before the handler could clear the session.
   * The button appeared to do nothing because it did nothing. Sign out must
   * reach its handler in every state.
   */
  it('sign out always reaches its handler, signed in or not', () => {
    for (const authenticated of [true, false]) {
      expect(
        decideAuthFlow({
          isAuthRoute: true,
          isSignOutRoute: true,
          configError: null,
          authBackend: 'ok',
          authenticated,
        }).kind,
        `signed-in=${authenticated} must reach the sign-out handler`,
      ).toBe('continue');
    }
  });

  it('sign out still reaches its handler when the auth backend is down', () => {
    expect(
      decideAuthFlow({
        isAuthRoute: true,
        isSignOutRoute: true,
        configError: null,
        authBackend: 'failed',
        authenticated: false,
      }).kind,
    ).toBe('continue');
  });

  it('a configuration fault still takes precedence over sign out', () => {
    // Nothing can run usefully without configuration, and the operator needs
    // to see the named fault rather than a silent redirect.
    expect(
      decideAuthFlow({
        isAuthRoute: true,
        isSignOutRoute: true,
        configError: 'NEXT_PUBLIC_SUPABASE_URL is not set.',
        authBackend: 'ok',
        authenticated: true,
      }).kind,
    ).toBe('config-error');
  });
});
