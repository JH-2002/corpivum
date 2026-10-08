import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { JournalView } from '@/components/modules/journal/JournalView';
import { readJournalParams } from '@/components/modules/journal/params';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { previousRange } from '@/lib/dates';
import { readPeriod } from '@/lib/period-server';
import { requireAppSession } from '@/modules/consent/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('journal') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession();
  const preview = await readPreviewState(searchParams);
  const { range, today } = await readPeriod();
  const { filter, layout } = await readJournalParams(searchParams);
  const view = healthView(session, today);
  // O resumo usa só dia e etiquetas (sem texto, sem filtro) do período e do anterior (ADR-0025).
  const [entries, current, previous] =
    view.kind === 'data' && !preview
      ? await view.source.session((s) =>
          Promise.all([
            s.journal(range, { withText: true, filter }),
            s.journal(range),
            s.journal(previousRange(range)),
          ]),
        )
      : [[], [], []];
  return (
    <HealthFrame page="journal" href="/diario" session={session} view={view} preview={preview}>
      {view.kind === 'data' ? (
        <JournalView
          entries={entries}
          summary={{ current, previous }}
          range={range}
          today={today}
          mode={view.mode}
          basePath="/diario"
          layout={layout}
          filter={filter}
        />
      ) : null}
    </HealthFrame>
  );
}
