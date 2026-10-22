import { useFormatter, useTranslations } from 'next-intl';
import {
  archiveHabitAction,
  deleteHabitAction,
  setStreaksAction,
} from '@/app/(app)/habitos/actions';
import { TimeChart } from '@/components/charts/TimeChart';
import { SubmitButton } from '@/components/forms/FormFields';
import { ExampleForm } from '@/components/forms/ExampleForm';
import { EntryActions } from '@/components/health/EntryActions';
import { HabitCheckButton } from '@/components/health/HabitCheckButton';
import type { HealthMode } from '@/components/health/HealthPage';
import { PeriodInsights, summaryTextId } from '@/components/insights/PeriodInsights';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { StateView } from '@/components/ui/StateView';
import { addDays, previousRange, WEEK_ORDER } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import {
  CHECK_BACKFILL_DAYS,
  completionRate,
  currentStreak,
  dailyChecks,
  isScheduled,
  type HabitCheckRecord,
  type HabitRecord,
} from '@/modules/habits';
import { habitsInsights } from '@/modules/insights';
import { HabitForm } from './HabitForm';

/**
 * Tela de hábitos (§22): criar, marcar os últimos dias, cumprimento no período, sequência desativável
 * e sem mensagem punitiva (LEG-F05), arquivar e excluir.
 */
export function HabitsView({
  habits,
  checks,
  previousChecks,
  streakChecks,
  range,
  today,
  mode,
  streaksEnabled,
}: {
  habits: HabitRecord[];
  checks: HabitCheckRecord[];
  /** Checks do período anterior de mesmo tamanho, para o resumo comparar (ADR-0025). */
  previousChecks: HabitCheckRecord[];
  /** Checks desde o início do intervalo da sequência (para calcular o streak). */
  streakChecks: HabitCheckRecord[];
  range: DateRange;
  today: string;
  mode: HealthMode;
  streaksEnabled: boolean;
}) {
  const t = useTranslations('habits');
  const format = useFormatter();
  const own = mode === 'own';
  const level = (l: 'INFORMADO' | 'ESTIMADO') => (own ? l : 'DEMO');
  const active = habits.filter((h) => !h.archived);
  const archived = habits.filter((h) => h.archived);
  const lastDays = Array.from({ length: CHECK_BACKFILL_DAYS }, (_, i) =>
    addDays(today, i - CHECK_BACKFILL_DAYS + 1),
  );
  const done = (habitId: string, day: string) =>
    streakChecks.some((c) => c.habitId === habitId && c.day === day);
  const shortDay = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), {
      weekday: 'short',
      day: '2-digit',
      timeZone: 'UTC',
    });
  const frequencyText = (h: HabitRecord) =>
    h.frequency === 'weekdays'
      ? t('frequencyWeekdays', {
          days: WEEK_ORDER.filter((d) => h.weekdays.includes(d))
            .map((d) => t(`weekdayShort.${d}`))
            .join(', '),
        })
      : h.frequency === 'times_per_week'
        ? t('frequencyTimes', { count: h.timesPerWeek ?? 1 })
        : t('frequency.daily');

  const insights = habitsInsights({
    habits,
    checks,
    previousChecks,
    range,
    previousRange: previousRange(range),
    today,
    streaksEnabled,
  });

  return (
    <div className="flex flex-col gap-6">
      <PeriodInsights insights={insights} demo={!own} />

      <section
        id="novo"
        aria-labelledby="habit-new"
        className="scroll-mt-32 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="habit-new" className="mb-3 text-base font-semibold">
          {t('newTitle')}
        </h2>
        {own ? (
          <HabitForm values={{ name: '', frequency: 'daily', weekdays: [], timesPerWeek: null }} />
        ) : (
          <ExampleForm publicDemo={mode === 'publicDemo'}>
            <HabitForm
              example
              values={{
                name: t('exampleName'),
                frequency: 'daily',
                weekdays: [],
                timesPerWeek: null,
              }}
            />
          </ExampleForm>
        )}
      </section>

      {own ? (
        <form
          action={setStreaksAction}
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4 text-sm"
        >
          <p className="flex-1">{streaksEnabled ? t('streaksOn') : t('streaksOff')}</p>
          <input type="hidden" name="enabled" value={streaksEnabled ? 'false' : 'true'} />
          <SubmitButton variant="secondary">
            {streaksEnabled ? t('streaksDisable') : t('streaksEnable')}
          </SubmitButton>
        </form>
      ) : null}

      {active.length === 0 ? (
        <StateView
          state="empty"
          emptyTitle={t('emptyTitle')}
          emptyDescription={t('emptyDescription')}
        />
      ) : (
        <>
          <TimeChart
            title={t('chartTitle')}
            badge={level('INFORMADO')}
            guide="habits"
            describedBy={summaryTextId('habits')}
            data={dailyChecks(habits, checks, range)}
            series={[
              {
                key: 'done',
                label: t('chartDone'),
                kind: 'bar',
                color: 'var(--hm-primary)',
                decimals: 0,
              },
              {
                key: 'scheduled',
                label: t('chartScheduled'),
                kind: 'line',
                color: 'var(--hm-fg-muted)',
                dash: '4 4',
                decimals: 0,
              },
            ]}
          />

          <section aria-labelledby="habit-list" className="flex flex-col gap-3">
            <h2 id="habit-list" className="text-base font-semibold">
              {t('listTitle')}
            </h2>
            <ul className="flex flex-col gap-3">
              {active.map((h) => {
                const rate = completionRate([h], checks, range);
                const streak = streaksEnabled ? currentStreak(h, streakChecks, today) : null;
                return (
                  <li
                    key={h.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">{h.name}</h3>
                        <p className="text-sm text-fg-muted">{frequencyText(h)}</p>
                      </div>
                      <ConfidenceBadge level={level('INFORMADO')} />
                    </div>
                    <p className="text-sm">
                      {rate !== null
                        ? t('completion', { value: Math.round(rate * 100) })
                        : t('completionNone')}
                      {streak !== null && streak > 0
                        ? ` · ${h.frequency === 'times_per_week' ? t('streakWeeks', { count: streak }) : t('streakDays', { count: streak })}`
                        : ''}
                    </p>
                    <div>
                      <p className="mb-1 text-sm font-semibold">{t('lastDays')}</p>
                      <ul className="flex flex-wrap gap-2">
                        {lastDays.map((day) => (
                          <li key={day} className="flex flex-col items-center gap-1 text-xs">
                            <span className={isScheduled(h, day) ? '' : 'text-fg-muted'}>
                              {shortDay(day)}
                            </span>
                            <HabitCheckButton
                              habitId={h.id}
                              name={`${h.name} (${shortDay(day)})`}
                              day={day}
                              done={done(h.id, day)}
                              readOnly={!own}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                    {own ? (
                      <div className="flex flex-wrap items-start gap-3">
                        <EntryActions id={h.id} itemLabel={h.name} deleteAction={deleteHabitAction}>
                          <HabitForm
                            values={{
                              id: h.id,
                              name: h.name,
                              frequency: h.frequency,
                              weekdays: h.weekdays,
                              timesPerWeek: h.timesPerWeek,
                            }}
                          />
                        </EntryActions>
                        <form action={archiveHabitAction}>
                          <input type="hidden" name="id" value={h.id} />
                          <input type="hidden" name="archived" value="true" />
                          <SubmitButton
                            variant="ghost"
                            aria-label={t('archiveLabel', { name: h.name })}
                          >
                            {t('archive')}
                          </SubmitButton>
                        </form>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {own && archived.length > 0 ? (
        <section aria-labelledby="habit-archived" className="flex flex-col gap-2">
          <h2 id="habit-archived" className="text-base font-semibold">
            {t('archivedTitle')}
          </h2>
          <ul className="flex flex-col gap-2">
            {archived.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3"
              >
                <span>{h.name}</span>
                <form action={archiveHabitAction}>
                  <input type="hidden" name="id" value={h.id} />
                  <input type="hidden" name="archived" value="false" />
                  <SubmitButton
                    variant="secondary"
                    aria-label={t('unarchiveLabel', { name: h.name })}
                  >
                    {t('unarchive')}
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
