import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('privacyCenter.deletion');
  return { title: t('doneTitle') };
}

/** Depois da exclusão de conta (LEG-D04): mensagem neutra, sem dados, com o que fica e o canal do encarregado. */
export default async function AccountDeletedPage() {
  const t = await getTranslations('privacyCenter.deletion');
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">{t('doneTitle')}</h1>
      <p className="mb-4">{t('doneBody')}</p>
      <p className="text-sm">
        <Link href="/legal/encarregado" className="font-semibold text-primary underline">
          {t('doneContact')}
        </Link>
      </p>
    </>
  );
}
