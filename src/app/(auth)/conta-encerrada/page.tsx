import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('privacyCenter');
  return { title: t('closedTitle') };
}

/** Depois do encerramento de conta de menor (LEG-F04): mensagem neutra e acolhedora, sem dados. */
async function AccountClosedPage() {
  const t = await getTranslations('privacyCenter');
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">{t('closedTitle')}</h1>
      <p className="mb-4">{t('closedBody')}</p>
      <p className="text-sm text-fg-muted">{t('closedSupport')}</p>
    </>
  );
}

export default withRouteMessages('(auth)/conta-encerrada', AccountClosedPage);
