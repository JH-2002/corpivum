import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NutritionView } from '@/components/modules/nutrition/NutritionView';
import { loadNutrition } from '@/modules/health/screens';
import { demoContext } from '../demo-data';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('nutrition') };
}

export default async function DemoNutritionPage() {
  const { range, today, source } = await demoContext();
  const data = await loadNutrition(source, range, today);
  return <NutritionView {...data} range={range} today={today} mode="publicDemo" />;
}
