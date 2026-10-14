import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { GoalsView } from '@/components/modules/goals/GoalsView';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { readPeriod } from '@/lib/period-server';
import { requireAppSession } from '@/modules/consent/server';
import { loadGoals } from '@/modules/health/screens';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('goals') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession();
  const preview = await readPreviewState(searchParams);
  const { today } = await readPeriod();
  const view = healthView(session, today);
  const data = view.kind === 'data' && !preview ? await loadGoals(view.source, today) : null;
  return (
    <HealthFrame page="goals" href="/metas" session={session} view={view} preview={preview}>
      {view.kind === 'data' && data ? (
        <GoalsView
          goals={data.goals}
          habits={data.habits}
          progress={data.progress}
          estimateEnabled={data.estimateEnabled}
          today={today}
          mode={view.mode}
        />
      ) : null}
    </HealthFrame>
  );
}
