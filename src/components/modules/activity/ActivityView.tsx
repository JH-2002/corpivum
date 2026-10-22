import { useFormatter, useTranslations } from 'next-intl';
import { deleteActivityAction } from '@/app/(app)/atividade/actions';
import { TimeChart } from '@/components/charts/TimeChart';
import { ExampleForm } from '@/components/forms/ExampleForm';
import { EntryActions } from '@/components/health/EntryActions';
import { formatDecimal, formatDuration, TREND_ARROW, trendOf } from '@/components/health/format';
import type { HealthMode } from '@/components/health/HealthPage';
import { StatTile } from '@/components/health/StatTile';
import { PeriodInsights, summaryTextId } from '@/components/insights/PeriodInsights';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { StateView } from '@/components/ui/StateView';
import { toLocalDateTime } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import {
  activeDays,
  dailyMinutes,
  exerciseProgression,
  lastChange,
  sessionCount,
  totalMinutes,
  type ActivityRecord,
} from '@/modules/activity';
import { activityInsights } from '@/modules/insights';
import { ActivityForm } from './ActivityForm';

/** Exercícios com gráfico de progressão (os com mais sessões). */
const PROGRESSION_CHARTS = 3;

/**
 * Tela de atividade (§26, LEG-M08): registro, minutos e sessões do período, progressão por exercício só
 * em relação ao próprio histórico (número, seta e palavra) e lista editável. Sem calorias gastas e sem
 * sugestão de carga, série ou treino. Mesma tela para dados próprios e demo.
 */
export function ActivityView({
  records,
  previous,
  weekMinutes,
  weeklyGoalMinutes,
  range,
  today,
  mode,
}: {
  records: ActivityRecord[];
  previous: ActivityRecord[];
  /** Minutos da semana corrente (segunda → hoje). */
  weekMinutes: number;
  /** Meta semanal de minutos da própria pessoa, se houver. */
  weeklyGoalMinutes: number | null;
  range: DateRange;
  today: string;
  mode: HealthMode;
}) {
  const t = useTranslations('activity');
  const format = useFormatter();
  const own = mode === 'own';
  const level = (l: 'INFORMADO' | 'ESTIMADO') => (own ? l : 'DEMO');
  const maxDateTime = toLocalDateTime(new Date());
  const longDay = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: 'full', timeZone: 'UTC' });
  const insights = activityInsights({
    records,
    previous,
    range,
    today,
    weeklyGoal:
      weeklyGoalMinutes === null ? null : { current: weekMinutes, target: weeklyGoalMinutes },
  });
  const progression = exerciseProgression(records);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-fg-muted">{t('intro')}</p>
      <PeriodInsights insights={insights} demo={!own} />

      <section
        id="novo"
        aria-labelledby="activity-new"
        className="scroll-mt-32 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="activity-new" className="mb-3 text-base font-semibold">
          {t('newTitle')}
        </h2>
        {own ? (
          <ActivityForm
            maxDateTime={maxDateTime}
            values={{
              startedAt: maxDateTime,
              type: 'walking',
              durationMin: null,
              intensity: null,
              distanceKm: null,
              note: null,
              sets: [],
            }}
          />
        ) : (
          <ExampleForm publicDemo={mode === 'publicDemo'}>
            <ActivityForm
              example
              maxDateTime={maxDateTime}
              values={{
                startedAt: maxDateTime,
                type: 'walking',
                durationMin: 30,
                intensity: null,
                distanceKm: null,
                note: null,
                sets: [],
              }}
            />
          </ExampleForm>
        )}
      </section>

      {records.length === 0 ? (
        <StateView state="no-data" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label={t('stats.minutes')}
              value={formatDuration(totalMinutes(records, range))}
              badge={level('ESTIMADO')}
            />
            <StatTile
              label={t('stats.sessions')}
              value={sessionCount(records, range)}
              badge={level('INFORMADO')}
            />
            <StatTile
              label={t('stats.activeDays')}
              value={activeDays(records, range)}
              badge={level('INFORMADO')}
            />
            <StatTile
              label={t('stats.week')}
              value={formatDuration(weekMinutes)}
              badge={level('ESTIMADO')}
            />
          </div>

          <TimeChart
            title={t('minutesChart')}
            badge={level('INFORMADO')}
            guide="activityMinutes"
            describedBy={summaryTextId('activity')}
            data={dailyMinutes(records, range)}
            series={[
              {
                key: 'minutes',
                label: t('minutesSeries'),
                unit: 'min',
                kind: 'bar',
                color: 'var(--hm-domain-activity)',
              },
            ]}
          />

          {progression.length > 0 ? (
            <section aria-labelledby="progression-title" className="flex flex-col gap-3">
              <h2 id="progression-title" className="text-base font-semibold">
                {t('progression.title')}
              </h2>
              <p className="text-sm text-fg-muted">{t('progression.intro')}</p>
              <ul className="grid gap-4 sm:grid-cols-2">
                {progression.map((e) => {
                  const last = e.sessions[e.sessions.length - 1];
                  const withLoad = last?.maxLoadKg !== null;
                  const change = lastChange(e.sessions, withLoad ? 'maxLoadKg' : 'totalReps');
                  const trend = change ? trendOf(change.delta) : null;
                  return (
                    <li key={e.key} className="rounded-lg border border-border bg-surface p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="font-semibold">{e.label}</h3>
                        <ConfidenceBadge level={level('INFORMADO')} />
                      </div>
                      <p className="text-sm text-fg-muted">
                        {t('progression.sessions', { count: e.sessions.length })}
                      </p>
                      {last ? (
                        <p className="tabular">
                          {withLoad
                            ? t('progression.lastLoad', {
                                load: formatDecimal(last.maxLoadKg ?? 0),
                              })
                            : t('progression.lastReps', { reps: last.totalReps })}
                        </p>
                      ) : null}
                      {change && trend ? (
                        <p className="tabular text-sm">
                          {t('progression.change', {
                            arrow: TREND_ARROW[trend],
                            delta: formatDecimal(Math.abs(change.delta)),
                            unit: withLoad ? t('progression.unitKg') : t('progression.unitReps'),
                            word: trend,
                          })}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {progression
                .filter((e) => e.sessions.length >= 2)
                .slice(0, PROGRESSION_CHARTS)
                .map((e) => {
                  const withLoad = e.sessions.some((s) => s.maxLoadKg !== null);
                  return (
                    <TimeChart
                      key={e.key}
                      title={t('progression.chartTitle', { exercise: e.label })}
                      badge={level('INFORMADO')}
                      guide="exercise"
                      describedBy={summaryTextId('activity')}
                      data={e.sessions.map((s) => ({
                        day: s.day,
                        value: withLoad ? s.maxLoadKg : s.totalReps,
                      }))}
                      series={[
                        {
                          key: 'value',
                          label: withLoad
                            ? t('progression.loadSeries')
                            : t('progression.repsSeries'),
                          unit: withLoad ? 'kg' : undefined,
                          kind: 'line',
                          color: 'var(--hm-domain-activity)',
                          decimals: 1,
                          integer: !withLoad,
                        },
                      ]}
                    />
                  );
                })}
            </section>
          ) : null}

          <section aria-labelledby="activity-list" className="flex flex-col gap-3">
            <h2 id="activity-list" className="text-base font-semibold">
              {t('listTitle')}
            </h2>
            <ul className="flex flex-col gap-3">
              {[...records].reverse().map((r) => {
                const label = `${longDay(r.day)}, ${t(`types.${r.type}`)}`;
                return (
                  <li key={r.id} className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-semibold">{longDay(r.day)}</h3>
                      <ConfidenceBadge level={level('INFORMADO')} />
                    </div>
                    <p className="tabular">
                      {t('entrySummary', {
                        type: t(`types.${r.type}`),
                        time: r.time,
                        duration: formatDuration(r.durationMin),
                      })}
                    </p>
                    <p className="text-sm text-fg-muted">
                      {[
                        r.distanceKm !== null
                          ? t('entryDistance', { km: formatDecimal(r.distanceKm) })
                          : null,
                        r.intensity !== null ? t('entryIntensity', { value: r.intensity }) : null,
                        r.sets.length > 0 ? t('entrySets', { count: r.sets.length }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {r.sets.length > 0 ? (
                      <ul className="mt-1 list-disc pl-5 text-sm">
                        {r.sets.map((s) => (
                          <li key={s.setIndex} className="tabular">
                            {s.loadKg !== null
                              ? t('entrySet', {
                                  exercise: s.exercise,
                                  reps: s.reps,
                                  load: `${formatDecimal(s.loadKg)} kg`,
                                })
                              : t('entrySetNoLoad', { exercise: s.exercise, reps: s.reps })}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {r.note ? <p className="mt-1 text-sm whitespace-pre-line">{r.note}</p> : null}
                    {own ? (
                      <div className="mt-2">
                        <EntryActions
                          id={r.id}
                          itemLabel={label}
                          deleteAction={deleteActivityAction}
                        >
                          <ActivityForm
                            maxDateTime={maxDateTime}
                            values={{ ...r, startedAt: toLocalDateTime(new Date(r.startedAt)) }}
                          />
                        </EntryActions>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
