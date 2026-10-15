import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TimelineView } from '@/components/modules/timeline/TimelineView';
import type { PageSearchParams } from '@/components/shell/ModulePage';
import { loadTimeline } from '@/modules/health/screens';
import { buildTimeline, parseTimelineDomain } from '@/modules/timeline';
import { maskTimeline } from '@/modules/health/mask';
import { demoContext } from '@/app/demo/demo-data';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('timeline') };
}

export default async function DemoTimelinePage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const { range, today, source, hidden } = await demoContext();
  const domain = parseTimelineDomain((await searchParams).dominio);
  const data = await loadTimeline(source, range);
  const days = buildTimeline({ ...data, range, today, domain });
  return (
    <TimelineView
      days={hidden ? maskTimeline(days) : days}
      domain={domain}
      basePath="/demo/timeline"
      range={range}
      today={today}
      mode="publicDemo"
      hidden={hidden}
    />
  );
}
