import { describe, expect, it } from 'vitest';
import { checkSupabaseAnonKey, checkSupabaseUrl } from './env';

/**
 * Regression suite for the production outage of 2026-08-20: a
 * present-but-malformed NEXT_PUBLIC_SUPABASE_URL passed the old presence-only
 * check and exploded inside the Supabase client, turning every route into a
 * bare 500. Each rejection must name the variable and the fault WITHOUT
 * echoing the value.
 */

function fakeJwt(payload: object): string {
  const b64url = (s: string) =>
    Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify(payload))}.${b64url('sig')}`;
}

const ANON_JWT = fakeJwt({ iss: 'supabase', role: 'anon', exp: 1983812996 });
const SERVICE_JWT = fakeJwt({ iss: 'supabase', role: 'service_role', exp: 1983812996 });

describe('checkSupabaseUrl', () => {
  it('rejects a missing value, naming the variable', () => {
    const r = checkSupabaseUrl(undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('NEXT_PUBLIC_SUPABASE_URL is not set');
  });

  it('rejects an empty or whitespace-only value', () => {
    expect(checkSupabaseUrl('').ok).toBe(false);
    expect(checkSupabaseUrl('   ').ok).toBe(false);
  });

  it('rejects a value wrapped in quotation marks (the production outage shape)', () => {
    const r = checkSupabaseUrl('"https://example.supabase.co"');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('quotation marks');
      expect(r.reason).not.toContain('example.supabase.co'); // never echo the value
    }
  });

  it('rejects a malformed URL without echoing it', () => {
    const r = checkSupabaseUrl('not a url at all');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('not a valid URL');
      expect(r.reason).not.toContain('not a url at all');
    }
  });

  it('rejects a non-HTTPS URL for remote hosts', () => {
    const r = checkSupabaseUrl('http://example.supabase.co');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('not an HTTPS URL');
  });

  it('allows plain http only for a local Supabase stack on loopback', () => {
    expect(checkSupabaseUrl('http://127.0.0.1:54321').ok).toBe(true);
    expect(checkSupabaseUrl('http://localhost:54321').ok).toBe(true);
  });

  it('accepts a valid HTTPS URL and trims surrounding whitespace', () => {
    const r = checkSupabaseUrl('  https://example.supabase.co \n');
    expect(r).toEqual({ ok: true, value: 'https://example.supabase.co' });
  });
});

describe('checkSupabaseAnonKey', () => {
  it('rejects a missing value, naming the variable', () => {
    const r = checkSupabaseAnonKey(undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  });

  it('rejects a value wrapped in quotation marks', () => {
    expect(checkSupabaseAnonKey(`'${ANON_JWT}'`).ok).toBe(false);
  });

  it('refuses a secret key outright', () => {
    const r = checkSupabaseAnonKey('sb_secret_abc123');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('SECRET');
      expect(r.reason).not.toContain('abc123');
    }
  });

  it('refuses the service-role key outright', () => {
    const r = checkSupabaseAnonKey(SERVICE_JWT);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('SERVICE-ROLE');
      expect(r.reason).not.toContain(SERVICE_JWT);
    }
  });

  it('rejects a truncated JWT', () => {
    expect(checkSupabaseAnonKey('eyJhbGciOiJIUzI1NiJ9.onlytwoparts').ok).toBe(false);
  });

  it('accepts a legacy anon JWT and trims whitespace', () => {
    expect(checkSupabaseAnonKey(` ${ANON_JWT} `)).toEqual({ ok: true, value: ANON_JWT });
  });

  it('accepts a publishable key', () => {
    expect(checkSupabaseAnonKey('sb_publishable_abc123').ok).toBe(true);
  });

  it('rejects unrecognised formats', () => {
    expect(checkSupabaseAnonKey('some-random-string').ok).toBe(false);
  });
});
