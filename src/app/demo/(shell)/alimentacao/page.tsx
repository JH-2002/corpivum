import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NutritionView } from '@/components/modules/nutrition/NutritionView';
import { loadNutrition } from '@/modules/health/screens';
import { maskNutritionScreen } from '@/modules/health/mask';
import { demoContext } from '@/app/demo/demo-data';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('nutrition') };
}

async function DemoNutritionPage() {
  const { range, today, source, hidden } = await demoContext();
  const loaded = await loadNutrition(source, range, today);
  const data = hidden ? maskNutritionScreen(loaded) : loaded;
  return <NutritionView {...data} range={range} today={today} mode="publicDemo" hidden={hidden} />;
}

export default withRouteMessages('demo/(shell)/alimentacao', DemoNutritionPage);
