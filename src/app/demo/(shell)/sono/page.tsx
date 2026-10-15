import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SleepView } from '@/components/modules/sleep/SleepView';
import { previousRange } from '@/lib/dates';
import { demoContext } from '@/app/demo/demo-data';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('sleep') };
}

export default async function DemoSleepPage() {
  const { range, today, source } = await demoContext();
  const [records, previous] = await Promise.all([
    source.sleep(range, { withText: true }),
    source.sleep(previousRange(range)),
  ]);
  return (
    <SleepView
      records={records}
      previous={previous}
      range={range}
      today={today}
      mode="publicDemo"
    />
  );
}
