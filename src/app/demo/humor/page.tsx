import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MoodView } from '@/components/modules/mood/MoodView';
import { demoContext } from '../demo-data';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('mood') };
}

export default async function DemoMoodPage() {
  const { range, source } = await demoContext();
  const records = await source.mood(range, { withText: true });
  return <MoodView records={records} range={range} mode="publicDemo" />;
}
