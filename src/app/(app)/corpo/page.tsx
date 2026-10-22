import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { BodyView } from '@/components/modules/body/BodyView';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { readPeriod } from '@/lib/period-server';
import { readPrivacyMode } from '@/lib/privacy-mode-server';
import { maskBodyScreen } from '@/modules/health/mask';
import { requireAppSession } from '@/modules/consent/server';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('body') };
}

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
  // Modo privacidade (ADR-0035): os valores saem aqui, antes de qualquer componente.
  const { records, latestHeightCm: height } = hidden
    ? maskBodyScreen(raw)
    : { records: raw, latestHeightCm: rawHeight };
  return (
    <HealthFrame page="body" href="/corpo" session={session} view={view} preview={preview}>
      {view.kind === 'data' ? (
        <BodyView
          records={records}
          latestHeightCm={height}
          range={range}
          today={today}
          mode={view.mode}
          hidden={hidden}
        />
      ) : null}
    </HealthFrame>
  );
}

export default withRouteMessages('(app)/corpo', Page);
