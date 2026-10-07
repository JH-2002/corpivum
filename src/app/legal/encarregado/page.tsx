import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DraftBanner } from '@/components/privacy/LegalDocument';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.dpo');
  return { title: t('title') };
}

/** Encarregado e canal de contato (LEG-G03). Nome e contato a definir (OI-12). */
export default async function DpoPage() {
  const t = await getTranslations('legal.dpo');
  return (
    <article className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <DraftBanner />
      <p>{t('body')}</p>
    </article>
  );
}
