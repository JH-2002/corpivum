import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OpenQuickLogButton } from '@/components/shell/OpenQuickLogButton';
import {
  ModulePage,
  resolvePreviewState,
  type PageSearchParams,
} from '@/components/shell/ModulePage';
import { requireAppSession } from '@/modules/consent/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('nutrition') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const { health } = await requireAppSession();
  const t = await getTranslations();
  return (
    <ModulePage
      page="nutrition"
      healthConsent={health}
      href="/alimentacao"
      state={await resolvePreviewState(searchParams)}
      emptyAction={<OpenQuickLogButton>{t('quickLog.open')}</OpenQuickLogButton>}
    />
  );
}
