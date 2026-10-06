import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OpenQuickLogButton } from '@/components/shell/OpenQuickLogButton';
import {
  ModulePage,
  resolvePreviewState,
  type PageSearchParams,
} from '@/components/shell/ModulePage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('mood') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  const t = await getTranslations();
  return (
    <ModulePage
      page="mood"
      href="/humor"
      state={await resolvePreviewState(searchParams)}
      emptyAction={<OpenQuickLogButton>{t('quickLog.open')}</OpenQuickLogButton>}
    />
  );
}
