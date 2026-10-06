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
  return { title: t('medications') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  const t = await getTranslations();
  return (
    <ModulePage
      page="medications"
      href="/medicamentos"
      state={await resolvePreviewState(searchParams)}
      emptyAction={<OpenQuickLogButton>{t('quickLog.open')}</OpenQuickLogButton>}
    >
      {/* Aviso fixo obrigatório (LEG-M02) */}
      <aside className="rounded-md border border-border bg-surface-muted p-4 text-sm">
        <p className="font-semibold">{t('disclaimer.medications')}</p>
        <p className="text-fg-muted">{t('disclaimer.medicationsScope')}</p>
      </aside>
    </ModulePage>
  );
}
