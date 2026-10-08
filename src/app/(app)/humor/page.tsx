import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { MoodView } from '@/components/modules/mood/MoodView';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { previousRange } from '@/lib/dates';
import { readPeriod } from '@/lib/period-server';
import { requireAppSession } from '@/modules/consent/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('mood') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession();
  const preview = await readPreviewState(searchParams);
  const { range, today } = await readPeriod();
  const view = healthView(session, today);
  const [records, previous] =
    view.kind === 'data' && !preview
      ? await view.source.session((s) =>
          Promise.all([s.mood(range, { withText: true }), s.mood(previousRange(range))]),
        )
      : [[], []];
  return (
    <HealthFrame page="mood" href="/humor" session={session} view={view} preview={preview}>
      {view.kind === 'data' ? (
        <MoodView
          records={records}
          previous={previous}
          range={range}
          today={today}
          mode={view.mode}
        />
      ) : null}
    </HealthFrame>
  );
}
