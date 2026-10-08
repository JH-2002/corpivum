import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { OpenQuickLogButton } from '@/components/shell/OpenQuickLogButton';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { readPeriod } from '@/lib/period-server';
import { requireAppSession } from '@/modules/consent/server';
import { buildDashboard } from '@/modules/health/dashboard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('home') };
}

/** Dashboard "Seu estado atual" (§11). Dados próprios (consentimento + RLS) ou demo (ADR-0021). */
export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession();
  const t = await getTranslations();
  const preview = await readPreviewState(searchParams);
  const { range, today } = await readPeriod();
  const view = healthView(session, today);
  const data =
    view.kind === 'data' && !preview
      ? await view.source.session((s) => buildDashboard(s, range, today))
      : null;
  return (
    <HealthFrame page="home" href="/inicio" session={session} view={view} preview={preview}>
      {data && view.kind === 'data' ? (
        <Dashboard
          data={data}
          mode={view.mode}
          emptyAction={<OpenQuickLogButton>{t('pages.home.cta')}</OpenQuickLogButton>}
        />
      ) : null}
    </HealthFrame>
  );
}
