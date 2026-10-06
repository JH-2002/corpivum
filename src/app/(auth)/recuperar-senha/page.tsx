import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForgotPasswordForm } from '@/components/auth/AuthForms';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.forgot');
  return { title: t('title') };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth.forgot');
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-4 text-sm text-fg-muted">{t('description')}</p>
      <ForgotPasswordForm />
    </>
  );
}
