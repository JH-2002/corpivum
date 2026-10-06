import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  ModulePage,
  resolvePreviewState,
  type PageSearchParams,
} from '@/components/shell/ModulePage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('goals') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  return <ModulePage page="goals" href="/metas" state={await resolvePreviewState(searchParams)} />;
}
