import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { MoodView } from '@/components/modules/mood/MoodView';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { readPeriod } from '@/lib/period-server';
import { requireAppSession } from '@/modules/consent/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('mood') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession();
  const preview = await readPreviewState(searchParams);
  const { range, today } = await readPeriod();
  const view = healthView(session, today);
  const records =
    view.kind === 'data' && !preview ? await view.source.mood(range, { withText: true }) : [];
  return (
    <HealthFrame page="mood" href="/humor" session={session} view={view} preview={preview}>
      {view.kind === 'data' ? <MoodView records={records} range={range} mode={view.mode} /> : null}
    </HealthFrame>
  );
}
