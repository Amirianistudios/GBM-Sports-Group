import { Suspense } from 'react';
import { LoginForm } from './login-form';
import { getTranslator } from '@/lib/i18n';

/**
 * The form reads `?next=` via useSearchParams, which opts it into client-side
 * rendering. The Suspense boundary keeps that from forcing the whole route to
 * bail out of prerendering.
 *
 * Login is the one surface a user meets before the app knows anything about
 * them, so its language comes from the cookie if they have set one and from
 * Accept-Language otherwise — a Georgian speaker signing in for the first time
 * should not have to read English to find the password field.
 */
export default async function LoginPage() {
  const { t } = await getTranslator();

  return (
    <Suspense fallback={<LoginSkeleton loading={t('login.loading')} />}>
      <LoginForm
        labels={{
          title: t('login.title'),
          email: t('login.email'),
          password: t('login.password'),
          submit: t('login.submit'),
          working: t('login.working'),
          noSignup: t('login.noSignup'),
        }}
      />
    </Suspense>
  );
}

function LoginSkeleton({ loading }: { loading: string }) {
  return (
    <div className="min-h-dvh flex flex-col justify-center px-5 py-12">
      <div className="w-full max-w-sm mx-auto">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-3xl font-bold tracking-tight">GBM</span>
          <span className="eyebrow">Intelligence</span>
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>{loading}</p>
      </div>
    </div>
  );
}
