'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export interface LoginLabels {
  title: string;
  email: string;
  password: string;
  submit: string;
  working: string;
  noSignup: string;
}

export function LoginForm({ labels }: { labels: LoginLabels }) {
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

    // Full document navigation at the auth boundary: the server must re-read
    // the fresh session cookie everywhere, and a router.replace immediately
    // followed by router.refresh can abort its own in-flight navigation —
    // which strands the route's loading skeleton.
    const next = params.get('next') || '/';
    window.location.assign(next.startsWith('/') ? next : '/');
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center px-5 py-12">
      <div className="w-full max-w-sm mx-auto">
        <div className="mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/gbm-logo.png"
            alt="GBM Sports Group"
            width={56}
            height={56}
            className="rounded-[6px] mb-4"
          />
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-3xl font-bold tracking-tight">GBM</span>
            <span className="eyebrow">Intelligence</span>
          </div>
          <p className="eyebrow mb-2" style={{ letterSpacing: '0.06em' }}>
            Elevating Careers · Building Legacies
          </p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {labels.title}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="eyebrow block mb-1.5">
              {labels.email}
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
              {labels.password}
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
            style={{ background: 'var(--color-verified)', color: '#06201C' }}
          >
            {status.kind === 'working' ? labels.working : labels.submit}
          </button>
        </form>

        <p className="mt-8 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
          {labels.noSignup}
        </p>
      </div>
    </div>
  );
}
