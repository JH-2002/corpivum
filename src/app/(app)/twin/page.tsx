import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { TwinBodyView, TwinSections } from '@/components/twin/TwinViews';
import { readPeriod } from '@/lib/period-server';
import { requireAppSession } from '@/modules/consent/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('twin.sections');
  return { title: t('body') };
}

/**
 * Corpo 3D (§15, §16, ADR-0026). Medidas próprias só com consentimento de saúde ativo (`healthView`:
 * sem ele, só o aviso e nenhuma leitura); no modo demo, só dados fictícios.
 */
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
    <HealthFrame page="twin" href="/twin" session={session} view={view} preview={preview}>
      {view.kind === 'data' ? (
        <div className="flex flex-col gap-6">
          <TwinSections base="/twin" current="body" />
          <TwinBodyView
            records={records}
            latestHeightCm={height}
            range={range}
            today={today}
            mode={view.mode}
          />
        </div>
      ) : null}
    </HealthFrame>
  );
}
