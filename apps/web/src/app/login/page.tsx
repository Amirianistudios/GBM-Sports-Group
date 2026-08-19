import { Suspense } from 'react';
import { LoginForm } from './login-form';

/**
 * The form reads `?next=` via useSearchParams, which opts it into client-side
 * rendering. The Suspense boundary keeps that from forcing the whole route to
 * bail out of prerendering.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginSkeleton() {
  return (
    <div className="min-h-dvh flex flex-col justify-center px-5 py-12">
      <div className="w-full max-w-sm mx-auto">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-3xl font-bold tracking-tight">GBM</span>
          <span className="eyebrow">Intelligence</span>
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    </div>
  );
}
