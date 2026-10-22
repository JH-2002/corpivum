import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/auth/AuthForms';
import { getCurrentSession } from '@/modules/auth/server';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.login');
  return { title: t('title') };
}

async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentSession();
  if (session && !session.mfaPending) redirect('/inicio');

  const t = await getTranslations('auth.login');
  const params = await searchParams;
  const notice =
    params.redefinida === '1'
      ? t('passwordReset')
      : params.saiu === '1'
        ? t('signedOut')
        : undefined;

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{t('title')}</h1>
      <LoginForm notice={notice} />
    </>
  );
}

export default withRouteMessages('(auth)/entrar', LoginPage);
