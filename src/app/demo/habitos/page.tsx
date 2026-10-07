import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HabitsView } from '@/components/modules/habits/HabitsView';
import { addDays } from '@/lib/dates';
import { STREAK_LOOKBACK_DAYS } from '@/modules/habits';
import { demoContext } from '../demo-data';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('habits') };
}

export default async function DemoHabitsPage() {
  const { range, today, source } = await demoContext();
  const [habits, checks, streakChecks] = await Promise.all([
    source.habits(),
    source.checks(range),
    source.checks({ from: addDays(today, -STREAK_LOOKBACK_DAYS), to: today }),
  ]);
  return (
    <HabitsView
      habits={habits}
      checks={checks}
      streakChecks={streakChecks}
      range={range}
      today={today}
      mode="publicDemo"
      streaksEnabled
    />
  );
}
