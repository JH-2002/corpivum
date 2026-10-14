import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GoalsView } from '@/components/modules/goals/GoalsView';
import { loadGoals } from '@/modules/health/screens';
import { demoContext } from '../demo-data';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('goals') };
}

export default async function DemoGoalsPage() {
  const { today, source } = await demoContext();
  const data = await loadGoals(source, today);
  return (
    <GoalsView
      goals={data.goals}
      habits={data.habits}
      progress={data.progress}
      suspended={data.suspended}
      estimateEnabled={data.estimateEnabled}
      today={today}
      mode="publicDemo"
    />
  );
}
