import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { SleepView } from '@/components/modules/sleep/SleepView';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { readPeriod } from '@/lib/period-server';
import { requireAppSession } from '@/modules/consent/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('sleep') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession();
  const preview = await readPreviewState(searchParams);
  const { range, today } = await readPeriod();
  const view = healthView(session, today);
  const records =
    view.kind === 'data' && !preview ? await view.source.sleep(range, { withText: true }) : [];
  return (
    <HealthFrame page="sleep" href="/sono" session={session} view={view} preview={preview}>
      {view.kind === 'data' ? (
        <SleepView records={records} range={range} today={today} mode={view.mode} />
      ) : null}
    </HealthFrame>
  );
}
