import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ResendVerificationForm, VerifyEmailForm } from '@/components/auth/AuthForms';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.verify');
  return { title: t('title') };
}

/**
 * Com `?token=`: confirma o e-mail por POST (botão). Sem token: pessoa logada com e-mail pendente, com
 * opção de reenviar o link (resposta sempre igual).
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('auth.verify');
  const { token } = await searchParams;

  if (typeof token === 'string' && token.length > 0) {
    return (
      <>
        <h1 className="mb-4 text-2xl font-bold">{t('title')}</h1>
        <VerifyEmailForm token={token.slice(0, 64)} />
      </>
    );
  }

  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">{t('pendingTitle')}</h1>
      <p className="mb-4 text-sm text-fg-muted">{t('pendingBody')}</p>
      <ResendVerificationForm />
    </>
  );
}
