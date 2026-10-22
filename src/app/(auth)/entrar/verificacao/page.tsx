import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MfaForm } from '@/components/auth/AuthForms';
import { getCurrentSession } from '@/modules/auth/server';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.mfa');
  return { title: t('title') };
}

async function MfaPage() {
  const session = await getCurrentSession();
  if (!session) redirect('/entrar');
  if (!session.mfaPending) redirect('/inicio');

  const t = await getTranslations('auth.mfa');
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-4 text-sm text-fg-muted">{t('description')}</p>
      <MfaForm />
    </>
  );
}

export default withRouteMessages('(auth)/entrar/verificacao', MfaPage);
