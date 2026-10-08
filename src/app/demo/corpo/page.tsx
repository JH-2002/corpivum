import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BodyView } from '@/components/modules/body/BodyView';
import { demoContext } from '../demo-data';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('body') };
}

export default async function DemoBodyPage() {
  const { range, source } = await demoContext();
  const [records, height] = await Promise.all([source.body(range), source.latestHeightCm()]);
  return <BodyView records={records} latestHeightCm={height} mode="publicDemo" />;
}
