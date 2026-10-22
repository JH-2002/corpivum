import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ActivityView } from '@/components/modules/activity/ActivityView';
import { loadActivity } from '@/modules/health/screens';
import { demoContext } from '@/app/demo/demo-data';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('activity') };
}

async function DemoActivityPage() {
  const { range, today, source } = await demoContext();
  const data = await loadActivity(source, range, today);
  return <ActivityView {...data} range={range} today={today} mode="publicDemo" />;
}

export default withRouteMessages('demo/(shell)/atividade', DemoActivityPage);
