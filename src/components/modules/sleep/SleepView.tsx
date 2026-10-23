import { useFormatter, useTranslations } from 'next-intl';
import { deleteSleepAction } from '@/app/(app)/sono/actions';
import { TimeChart } from '@/components/charts/TimeChart';
import { ExampleForm } from '@/components/forms/ExampleForm';
import { NoRecords } from '@/components/health/NoRecords';
import { EntryActions } from '@/components/health/EntryActions';
import { formatDecimal, formatDuration } from '@/components/health/format';
import { PeriodInsights, summaryTextId } from '@/components/insights/PeriodInsights';
import type { HealthMode } from '@/components/health/HealthPage';
import { StatTile } from '@/components/health/StatTile';
import { WeeklyList } from '@/components/health/WeeklyList';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { addDays, groupByWeek, toLocalDateTime } from '@/lib/dates';
import { sleepInsights } from '@/modules/insights';
import type { DateRange } from '@/lib/period';
import {
  averageDurationMinutes,
  averageQuality,
  dailyHours,
  durationMinutes,
  scheduleSpreadMinutes,
  type SleepRecord,
} from '@/modules/sleep';
import { ScheduleChart } from './ScheduleChart';
import { SleepForm } from './SleepForm';

/**
 * Tela de sono (§20): registro, métricas do período, duração por dia, horário em barras flutuantes e
 * lista editável por semana com "Ver mais" (como as outras listas, 9d). Mesma tela para dados próprios e demo (somente leitura, selo DEMO).
 */
export function SleepView({
  records,
  previous,
  range,
  today,
  mode,
}: {
  records: SleepRecord[];
  /** Noites do período anterior de mesmo tamanho, para o resumo comparar (ADR-0025). */
  previous: SleepRecord[];
  range: DateRange;
  today: string;
  mode: HealthMode;
}) {
  const t = useTranslations('sleep');
  const format = useFormatter();
  const own = mode === 'own';
  const level = (l: 'INFORMADO' | 'ESTIMADO') => (own ? l : 'DEMO');
  const avg = averageDurationMinutes(records);
  const spread = scheduleSpreadMinutes(records);
  const quality = averageQuality(records);
  const maxDateTime = toLocalDateTime(new Date());
  const longDay = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: 'full', timeZone: 'UTC' });

  const insights = sleepInsights({ records, previous, range, today });

  return (
    <div className="flex flex-col gap-6">
      <PeriodInsights insights={insights} demo={!own} />

      <section
        id="novo"
        aria-labelledby="sleep-new"
        className="scroll-mt-32 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="sleep-new" className="mb-3 text-base font-semibold">
          {t('newTitle')}
        </h2>
        {own ? (
          <SleepForm
            maxDateTime={maxDateTime}
            values={{
              bedAt: `${addDays(today, -1)}T23:00`,
              wakeAt: `${today}T07:00`,
              quality: null,
              awakenings: null,
              note: null,
            }}
          />
        ) : (
          <ExampleForm publicDemo={mode === 'publicDemo'}>
            <SleepForm
              example
              maxDateTime={maxDateTime}
              values={{
                bedAt: `${addDays(today, -1)}T23:00`,
                wakeAt: `${today}T07:00`,
                quality: 4,
                awakenings: 1,
                note: null,
              }}
            />
          </ExampleForm>
        )}
      </section>

      {records.length === 0 ? (
        <NoRecords mode={mode} nextStep={t('nextStep')} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label={t('stats.average')}
              value={avg !== null ? formatDuration(avg) : '—'}
              badge={level('ESTIMADO')}
            />
            <StatTile
              label={t('stats.spread')}
              value={spread !== null ? formatDuration(spread) : '—'}
              detail={spread !== null ? t('stats.spreadHint') : t('stats.spreadNeedsMore')}
              badge={level('ESTIMADO')}
            />
            <StatTile
              label={t('stats.quality')}
              value={quality !== null ? `${formatDecimal(quality)} / 5` : '—'}
              badge={level('ESTIMADO')}
            />
            <StatTile label={t('stats.count')} value={records.length} badge={level('INFORMADO')} />
          </div>

          <TimeChart
            title={t('durationChart')}
            badge={level('INFORMADO')}
            guide="sleepDuration"
            describedBy={summaryTextId('sleep')}
            data={dailyHours(records, range)}
            series={[
              {
                key: 'hours',
                label: t('hours'),
                unit: 'h',
                kind: 'bar',
                color: 'var(--hm-chart-1)',
              },
            ]}
          />
          <ScheduleChart
            title={t('scheduleChart')}
            rows={records}
            badge={level('INFORMADO')}
            describedBy={summaryTextId('sleep')}
          />

          <section aria-labelledby="sleep-list" className="flex flex-col gap-3">
            <h2 id="sleep-list" className="text-base font-semibold">
              {t('listTitle')}
            </h2>
            <WeeklyList
              weeks={groupByWeek([...records].reverse(), (r) => r.day).map((w) => ({
                start: w.start,
                end: w.end,
                content: (
                  <ul className="flex flex-col gap-3">
                    {w.items.map((r) => (
                      <li key={r.id} className="rounded-lg border border-border bg-surface p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h4 className="font-semibold">{longDay(r.day)}</h4>
                          <ConfidenceBadge level={level('INFORMADO')} />
                        </div>
                        <p className="tabular">
                          {t('entrySummary', {
                            bed: r.bedTime,
                            wake: r.wakeTime,
                            duration: formatDuration(durationMinutes(r)),
                          })}
                        </p>
                        <p className="text-sm text-fg-muted">
                          {r.quality !== null ? t('entryQuality', { value: r.quality }) : null}
                          {r.quality !== null && r.awakenings !== null ? ' · ' : null}
                          {r.awakenings !== null
                            ? t('entryAwakenings', { count: r.awakenings })
                            : null}
                        </p>
                        {r.note ? (
                          <p className="mt-1 text-sm whitespace-pre-line">{r.note}</p>
                        ) : null}
                        {own ? (
                          <div className="mt-2">
                            <EntryActions
                              id={r.id}
                              itemLabel={longDay(r.day)}
                              deleteAction={deleteSleepAction}
                            >
                              <SleepForm
                                maxDateTime={maxDateTime}
                                values={{
                                  id: r.id,
                                  bedAt: toLocalDateTime(new Date(r.bedAt)),
                                  wakeAt: toLocalDateTime(new Date(r.wakeAt)),
                                  quality: r.quality,
                                  awakenings: r.awakenings,
                                  note: r.note,
                                }}
                              />
                            </EntryActions>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ),
              }))}
            />
          </section>
        </>
      )}
    </div>
  );
}
