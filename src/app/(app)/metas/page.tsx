import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { GoalsView } from '@/components/modules/goals/GoalsView';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { readPeriod } from '@/lib/period-server';
import { requireAppSession } from '@/modules/consent/server';
import { maskGoalsScreen } from '@/modules/health/mask';
import { loadGoals } from '@/modules/health/screens';
import { readPrivacyMode } from '@/lib/privacy-mode-server';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('goals') };
}

async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession();
  const preview = await readPreviewState(searchParams);
  const { today } = await readPeriod();
  const view = healthView(session, today);
  const hidden = await readPrivacyMode();
  const loaded = view.kind === 'data' && !preview ? await loadGoals(view.source, today) : null;
  const data = loaded && hidden ? maskGoalsScreen(loaded) : loaded;
  return (
    <HealthFrame page="goals" href="/metas" session={session} view={view} preview={preview}>
      {view.kind === 'data' && data ? (
        <GoalsView
          goals={data.goals}
          habits={data.habits}
          progress={data.progress}
          suspended={data.suspended}
          estimateEnabled={data.estimateEnabled}
          today={today}
          mode={view.mode}
          hidden={hidden}
        />
      ) : null}
    </HealthFrame>
  );
}

export default withRouteMessages('(app)/metas', Page);
