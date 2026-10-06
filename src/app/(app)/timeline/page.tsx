import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  ModulePage,
  resolvePreviewState,
  type PageSearchParams,
} from '@/components/shell/ModulePage';
import { requireVerifiedSession } from '@/modules/auth/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('timeline') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  await requireVerifiedSession();
  return (
    <ModulePage page="timeline" href="/timeline" state={await resolvePreviewState(searchParams)} />
  );
}
