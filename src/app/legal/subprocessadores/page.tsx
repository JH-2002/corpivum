import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DraftBanner } from '@/components/privacy/LegalDocument';
import { SubprocessorTable } from '@/components/privacy/SubprocessorTable';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.subprocessorsPage');
  return { title: t('title') };
}

/** Lista pública de subprocessadores (LEG-D06, LEG-S10). Espelho de docs/privacy/SUBPROCESSORS.md. */
export default async function SubprocessorsPage() {
  const t = await getTranslations('legal.subprocessorsPage');
  return (
    <article className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <DraftBanner />
      <p>{t('intro')}</p>
      <SubprocessorTable />
    </article>
  );
}
