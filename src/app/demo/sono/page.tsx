import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SleepView } from '@/components/modules/sleep/SleepView';
import { demoContext } from '../demo-data';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('sleep') };
}

export default async function DemoSleepPage() {
  const { range, today, source } = await demoContext();
  const records = await source.sleep(range, { withText: true });
  return <SleepView records={records} range={range} today={today} mode="publicDemo" />;
}
