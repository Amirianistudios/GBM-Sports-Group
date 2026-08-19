'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'working' | 'error'; message?: string }>({
    kind: 'idle',
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: 'working' });

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Say what went wrong and what to do — never a bare "failed".
      setStatus({
        kind: 'error',
        message:
          error.message === 'Invalid login credentials'
            ? 'That email and password combination does not match an account.'
            : error.message,
      });
      return;
    }

    router.replace(params.get('next') || '/');
    router.refresh();
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center px-5 py-12">
      <div className="w-full max-w-sm mx-auto">
        <div className="mb-10">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-3xl font-bold tracking-tight">GBM</span>
            <span className="eyebrow">Intelligence</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Internal football intelligence for GBM Sports Group. Sign in to continue.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="eyebrow block mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 text-base rounded-[3px]"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--fg)' }}
            />
          </div>

          <div>
            <label htmlFor="password" className="eyebrow block mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 text-base rounded-[3px]"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--fg)' }}
            />
          </div>

          {status.kind === 'error' && (
            <p
              role="alert"
              className="text-sm px-3 py-2 rounded-[3px]"
              style={{
                background: 'color-mix(in srgb, var(--color-conflict) 12%, transparent)',
                color: 'var(--color-conflict)',
              }}
            >
              {status.message}
            </p>
          )}

          <button
            type="submit"
            disabled={status.kind === 'working'}
            className="w-full py-2.5 rounded-[3px] font-semibold text-sm disabled:opacity-60"
            style={{ background: 'var(--color-verified)', color: '#fff' }}
          >
            {status.kind === 'working' ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-8 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
          Accounts are created by a GBM administrator. There is no public sign-up and no public
          player database.
        </p>
      </div>
    </div>
  );
}
