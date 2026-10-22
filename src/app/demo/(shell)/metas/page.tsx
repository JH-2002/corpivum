import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GoalsView } from '@/components/modules/goals/GoalsView';
import { loadGoals } from '@/modules/health/screens';
import { maskGoalsScreen } from '@/modules/health/mask';
import { demoContext } from '@/app/demo/demo-data';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('goals') };
}

async function DemoGoalsPage() {
  const { today, source, hidden } = await demoContext();
  const loaded = await loadGoals(source, today);
  const data = hidden ? maskGoalsScreen(loaded) : loaded;
  return (
    <GoalsView
      goals={data.goals}
      habits={data.habits}
      progress={data.progress}
      suspended={data.suspended}
      estimateEnabled={data.estimateEnabled}
      today={today}
      mode="publicDemo"
      hidden={hidden}
    />
  );
}

export default withRouteMessages('demo/(shell)/metas', DemoGoalsPage);
