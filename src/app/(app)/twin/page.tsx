import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { TwinBodyView } from '@/components/twin/TwinViews';
import { readPeriod } from '@/lib/period-server';
import { readPrivacyMode } from '@/lib/privacy-mode-server';
import { maskBodyScreen } from '@/modules/health/mask';
import { requireAppSession } from '@/modules/consent/server';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('twin');
  return { title: t('title') };
}

/**
 * Corpo 3D (§15, §16, ADR-0026). Medidas próprias só com consentimento de saúde ativo (`healthView`:
 * sem ele, só o aviso e nenhuma leitura); no modo demo, só dados fictícios.
 */
async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession();
  const preview = await readPreviewState(searchParams);
  const { range, today } = await readPeriod();
  const view = healthView(session, today);
  const hidden = await readPrivacyMode();
  const [raw, rawHeight] =
    view.kind === 'data' && !preview
      ? await view.source.session((s) => Promise.all([s.body(range), s.latestHeightCm()]))
      : [[], null];
  // Modo privacidade (ADR-0035): medidas próprias não saem do servidor (o modelo fica na forma de
  // referência). No demo os dados são fictícios e a forma continua; só os números ficam ocultos.
  const own = view.kind === 'data' && view.mode === 'own';
  const { records, latestHeightCm: height } =
    hidden && own ? maskBodyScreen(raw) : { records: raw, latestHeightCm: rawHeight };
  return (
    <HealthFrame page="twin" href="/twin" session={session} view={view} preview={preview}>
      {view.kind === 'data' ? (
        <div className="flex flex-col gap-6">
          <TwinBodyView
            records={records}
            latestHeightCm={height}
            range={range}
            today={today}
            mode={view.mode}
            hidden={hidden}
          />
        </div>
      ) : null}
    </HealthFrame>
  );
}

export default withRouteMessages('(app)/twin', Page);
