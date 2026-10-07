import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  ModulePage,
  resolvePreviewState,
  type PageSearchParams,
} from '@/components/shell/ModulePage';
import { requireAppSession } from '@/modules/consent/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('twin') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const { health } = await requireAppSession();
  return (
    <ModulePage
      page="twin"
      healthConsent={health}
      href="/twin"
      state={await resolvePreviewState(searchParams)}
    />
  );
}
