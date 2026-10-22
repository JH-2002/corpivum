import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LinkTokenGate } from '@/components/auth/LinkToken';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.reset');
  return { title: t('title') };
}

async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('auth');
  const { token } = await searchParams;

  // Token do link no fragmento (`#token=`), lido e limpo no navegador (TM-01).
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">{t('reset.title')}</h1>
      <LinkTokenGate
        kind="reset"
        {...(typeof token === 'string' ? { fromQuery: token } : {})}
        withToken={<p className="mb-4 text-sm text-fg-muted">{t('reset.description')}</p>}
        fallback={
          <>
            <p role="status" className="mb-4">
              {t('reset.missingToken')}
            </p>
            <Link
              href="/recuperar-senha"
              className="font-semibold text-primary underline underline-offset-2"
            >
              {t('forgot.title')}
            </Link>
          </>
        }
      />
    </>
  );
}

export default withRouteMessages('(auth)/redefinir-senha', ResetPasswordPage);
