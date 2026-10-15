import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BodyView } from '@/components/modules/body/BodyView';
import { maskBodyScreen } from '@/modules/health/mask';
import { demoContext } from '../demo-data';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('body') };
}

export default async function DemoBodyPage() {
  const { range, today, source, hidden } = await demoContext();
  const [raw, rawHeight] = await Promise.all([source.body(range), source.latestHeightCm()]);
  const { records, latestHeightCm: height } = hidden
    ? maskBodyScreen(raw)
    : { records: raw, latestHeightCm: rawHeight };
  return (
    <BodyView
      records={records}
      latestHeightCm={height}
      range={range}
      today={today}
      mode="publicDemo"
      hidden={hidden}
    />
  );
}
