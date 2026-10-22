import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ResendVerificationForm } from '@/components/auth/AuthForms';
import { LinkTokenGate } from '@/components/auth/LinkToken';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.verify');
  return { title: t('title') };
}

/**
 * Com o token do link (`#token=`, ou `?token=` de links antigos; TM-01): confirma o e-mail por POST (botão).
 * Sem token: pessoa logada com e-mail pendente, com opção de reenviar o link (resposta sempre igual).
 */
async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('auth.verify');
  const { token } = await searchParams;

  return (
    <LinkTokenGate
      kind="verify"
      {...(typeof token === 'string' ? { fromQuery: token } : {})}
      withToken={<h1 className="mb-4 text-2xl font-bold">{t('title')}</h1>}
      fallback={
        <>
          <h1 className="mb-2 text-2xl font-bold">{t('pendingTitle')}</h1>
          <p className="mb-4 text-sm text-fg-muted">{t('pendingBody')}</p>
          <ResendVerificationForm />
        </>
      }
    />
  );
}

export default withRouteMessages('(auth)/verificar-email', VerifyEmailPage);
