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
      for (const configError of [null, 'NEXT_PUBLIC_SUPABASE_URL is not set.']) {
        for (const authBackend of ['ok', 'failed'] as const) {
          for (const authenticated of [true, false]) {
            const outcome = decideAuthFlow({ isAuthRoute, configError, authBackend, authenticated });
            expect(KINDS).toContain(outcome.kind);
          }
        }
      }
    }
  });

  it('a configuration fault returns the named config error on every route', () => {
    for (const isAuthRoute of [true, false]) {
      const outcome = decideAuthFlow({
        isAuthRoute,
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
      isAuthRoute: false,
      configError: null,
      authBackend: 'failed',
      authenticated: false,
    });
    expect(outcome.kind).toBe('service-error');
  });

  it('an auth-backend failure still lets the login surface render', () => {
    const outcome = decideAuthFlow({
      isAuthRoute: true,
      configError: null,
      authBackend: 'failed',
      authenticated: false,
    });
    expect(outcome.kind).toBe('continue');
  });

  it('an unauthenticated visitor renders /login', () => {
    const outcome = decideAuthFlow({
      isAuthRoute: true,
      configError: null,
      authBackend: 'ok',
      authenticated: false,
    });
    expect(outcome.kind).toBe('continue');
  });

  it('an unauthenticated visitor on a protected route is redirected to /login', () => {
    const outcome = decideAuthFlow({
      isAuthRoute: false,
      configError: null,
      authBackend: 'ok',
      authenticated: false,
    });
    expect(outcome.kind).toBe('redirect-login');
  });

  it('an authenticated user on /login is sent home; on a protected route continues', () => {
    expect(
      decideAuthFlow({ isAuthRoute: true, configError: null, authBackend: 'ok', authenticated: true })
        .kind,
    ).toBe('redirect-home');
    expect(
      decideAuthFlow({ isAuthRoute: false, configError: null, authBackend: 'ok', authenticated: true })
        .kind,
    ).toBe('continue');
  });
});
