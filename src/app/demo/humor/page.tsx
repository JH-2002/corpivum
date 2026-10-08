import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MoodView } from '@/components/modules/mood/MoodView';
import { previousRange } from '@/lib/dates';
import { demoContext } from '../demo-data';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('mood') };
}

export default async function DemoMoodPage() {
  const { range, today, source } = await demoContext();
  const [records, previous] = await Promise.all([
    source.mood(range, { withText: true }),
    source.mood(previousRange(range)),
  ]);
  return (
    <MoodView records={records} previous={previous} range={range} today={today} mode="publicDemo" />
  );
}
