import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { HabitsView } from '@/components/modules/habits/HabitsView';
import { RemindersSection } from '@/components/modules/reminders/RemindersSection';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { addDays, previousRange } from '@/lib/dates';
import { readPeriod } from '@/lib/period-server';
import { requireAppSession } from '@/modules/consent/server';
import { STREAK_LOOKBACK_DAYS } from '@/modules/habits';
import { loadReminders } from '@/modules/health/screens';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('habits') };
}

async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession();
  const preview = await readPreviewState(searchParams);
  const { range, today } = await readPeriod();
  const view = healthView(session, today);
  if (view.kind !== 'data' || preview) {
    return (
      <HealthFrame page="habits" href="/habitos" session={session} view={view} preview={preview}>
        {null}
      </HealthFrame>
    );
  }
  const [habits, checks, previousChecks, streakChecks, streaksEnabled] = await view.source.session(
    (s) =>
      Promise.all([
        s.habits({ includeArchived: true }),
        s.checks(range),
        s.checks(previousRange(range)),
        s.checks({ from: addDays(today, -STREAK_LOOKBACK_DAYS), to: today }),
        s.streaksEnabled(),
      ]),
  );
  const reminders = await loadReminders(view.source);
  return (
    <HealthFrame page="habits" href="/habitos" session={session} view={view} preview={preview}>
      <HabitsView
        habits={habits}
        checks={checks}
        previousChecks={previousChecks}
        streakChecks={streakChecks}
        range={range}
        today={today}
        mode={view.mode}
        streaksEnabled={streaksEnabled}
      />
      <RemindersSection {...reminders} mode={view.mode} />
    </HealthFrame>
  );
}

export default withRouteMessages('(app)/habitos', Page);
