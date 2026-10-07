import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { BodyView } from '@/components/modules/body/BodyView';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { readPeriod } from '@/lib/period-server';
import { requireAppSession } from '@/modules/consent/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('body') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession();
  const preview = await readPreviewState(searchParams);
  const { range, today } = await readPeriod();
  const view = healthView(session, today);
  const [records, height] =
    view.kind === 'data' && !preview
      ? await view.source.session((s) => Promise.all([s.body(range), s.latestHeightCm()]))
      : [[], null];
  return (
    <HealthFrame page="body" href="/corpo" session={session} view={view} preview={preview}>
      {view.kind === 'data' ? (
        <BodyView records={records} latestHeightCm={height} mode={view.mode} />
      ) : null}
    </HealthFrame>
  );
}
