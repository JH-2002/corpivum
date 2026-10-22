import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TwinBodyView } from '@/components/twin/TwinViews';
import { demoContext } from '@/app/demo/demo-data';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('twin');
  return { title: t('title') };
}

/** Corpo 3D no demo público: só dados fictícios, sem sessão e sem banco (LEG-X02). */
async function DemoTwinPage() {
  const { range, today, source, hidden } = await demoContext();
  const [records, height] = await Promise.all([source.body(range), source.latestHeightCm()]);
  return (
    <div className="flex flex-col gap-6">
      <TwinBodyView
        records={records}
        latestHeightCm={height}
        range={range}
        today={today}
        mode="publicDemo"
        hidden={hidden}
      />
    </div>
  );
}

export default withRouteMessages('demo/(shell)/twin', DemoTwinPage);
