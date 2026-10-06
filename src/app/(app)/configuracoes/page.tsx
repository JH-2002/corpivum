import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  ModulePage,
  resolvePreviewState,
  type PageSearchParams,
} from '@/components/shell/ModulePage';
import { ThemeSelector } from '@/components/theme/ThemeSelector';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('settings') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  return (
    <ModulePage
      page="settings"
      href="/configuracoes"
      state={await resolvePreviewState(searchParams)}
    >
      <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <ThemeSelector />
      </section>
    </ModulePage>
  );
}
