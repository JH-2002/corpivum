import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { ActivityView } from '@/components/modules/activity/ActivityView';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { readPeriod } from '@/lib/period-server';
import { requireAppSession } from '@/modules/consent/server';
import { loadActivity } from '@/modules/health/screens';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('activity') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession();
  const preview = await readPreviewState(searchParams);
  const { range, today } = await readPeriod();
  const view = healthView(session, today);
  const data =
    view.kind === 'data' && !preview ? await loadActivity(view.source, range, today) : null;
  return (
    <HealthFrame page="activity" href="/atividade" session={session} view={view} preview={preview}>
      {view.kind === 'data' && data ? (
        <ActivityView {...data} range={range} today={today} mode={view.mode} />
      ) : null}
    </HealthFrame>
  );
}
