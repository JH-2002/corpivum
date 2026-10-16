import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { OpenQuickLogButton } from '@/components/shell/OpenQuickLogButton';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { readPeriod } from '@/lib/period-server';
import { readPrivacyMode } from '@/lib/privacy-mode-server';
import { maskDashboard } from '@/modules/health/mask';
import { requireAppSession } from '@/modules/consent/server';
import { UpcomingReminders } from '@/components/modules/reminders/UpcomingReminders';
import { buildDashboard } from '@/modules/health/dashboard';
import { loadReminders } from '@/modules/health/screens';
import { hasSeenTour } from '@/modules/health/server';
import { Tour } from '@/components/tour/Tour';

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
  const hidden = await readPrivacyMode();
  const data =
    view.kind === 'data' && !preview
      ? await view.source.session(async (s) => ({
          dashboard: await buildDashboard(s, range, today),
          reminders: await loadReminders(s),
        }))
      : null;
  // Só com o painel na tela; se a leitura falhar, o tour não abre sozinho (e o painel não cai).
  const tourSeen = data ? await hasSeenTour(session.userId).catch(() => true) : true;
  return (
    <HealthFrame page="home" href="/inicio" session={session} view={view} preview={preview}>
      {data && view.kind === 'data' ? (
        <>
          <Dashboard
            data={hidden ? maskDashboard(data.dashboard) : data.dashboard}
            mode={view.mode}
            hidden={hidden}
            emptyAction={<OpenQuickLogButton>{t('pages.home.cta')}</OpenQuickLogButton>}
          />
          <UpcomingReminders
            reminders={data.reminders.reminders}
            prefs={data.reminders.prefs}
            habits={data.reminders.habits}
            now={new Date()}
            manageHref="/habitos#lembretes"
            demo={view.mode !== 'own'}
          />
        </>
      ) : null}
      {/* Tour opcional (ADR-0025): sozinho na primeira visita; reaberto pelo menu de ajuda. */}
      {data ? (
        <Suspense fallback={null}>
          <Tour autoStart={!tourSeen} persist="server" />
        </Suspense>
      ) : null}
    </HealthFrame>
  );
}
