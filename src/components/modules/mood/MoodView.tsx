import { useFormatter, useTranslations } from 'next-intl';
import { deleteMoodAction } from '@/app/(app)/humor/actions';
import { TimeChart } from '@/components/charts/TimeChart';
import { DemoReadOnlyNotice } from '@/components/health/DemoModeBanner';
import { EntryActions } from '@/components/health/EntryActions';
import { formatDecimal } from '@/components/health/format';
import type { HealthMode } from '@/components/health/HealthPage';
import { StatTile } from '@/components/health/StatTile';
import { SupportNotice } from '@/components/health/SupportNotice';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { StateView } from '@/components/ui/StateView';
import { localTime, toLocalDateTime, WEEK_ORDER } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { averageOf, byWeekday, dailyAverages, type MoodRecord } from '@/modules/mood';
import { MoodForm } from './MoodForm';

/**
 * Tela de humor e energia (§21): registro rápido, médias do período, tendência, distribuição por dia da
 * semana e lista editável. Orientação de apoio sempre visível (§48).
 */
export function MoodView({
  records,
  range,
  mode,
}: {
  records: MoodRecord[];
  range: DateRange;
  mode: HealthMode;
}) {
  const t = useTranslations('mood');
  const format = useFormatter();
  const own = mode === 'own';
  const level = (l: 'INFORMADO' | 'ESTIMADO') => (own ? l : 'DEMO');
  const maxDateTime = toLocalDateTime(new Date());
  const weekdays = byWeekday(records);
  const longDay = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: 'full', timeZone: 'UTC' });
  const stat = (v: number | null) => (v === null ? '—' : `${formatDecimal(v)} / 5`);

  return (
    <div className="flex flex-col gap-6">
      <section
        id="novo"
        aria-labelledby="mood-new"
        className="scroll-mt-32 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="mood-new" className="mb-3 text-base font-semibold">
          {t('newTitle')}
        </h2>
        {own ? (
          <MoodForm
            maxDateTime={maxDateTime}
            values={{
              loggedAt: maxDateTime,
              mood: null,
              energy: null,
              stress: null,
              emotions: [],
              note: null,
            }}
          />
        ) : (
          <DemoReadOnlyNotice publicDemo={mode === 'publicDemo'} />
        )}
      </section>

      {records.length === 0 ? (
        <StateView state="no-data" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label={t('stats.mood')}
              value={stat(averageOf(records, 'mood'))}
              badge={level('ESTIMADO')}
            />
            <StatTile
              label={t('stats.energy')}
              value={stat(averageOf(records, 'energy'))}
              badge={level('ESTIMADO')}
            />
            <StatTile
              label={t('stats.stress')}
              value={stat(averageOf(records, 'stress'))}
              badge={level('ESTIMADO')}
            />
            <StatTile label={t('stats.count')} value={records.length} badge={level('INFORMADO')} />
          </div>

          <TimeChart
            title={t('trendChart')}
            description={t('trendDescription')}
            badge={level('INFORMADO')}
            data={dailyAverages(records, range)}
            leftDomain={[1, 5]}
            series={[
              {
                key: 'mood',
                label: t('form.mood'),
                unit: t('scale'),
                kind: 'line',
                color: 'var(--hm-domain-mood)',
              },
              {
                key: 'energy',
                label: t('form.energy'),
                unit: t('scale'),
                kind: 'line',
                color: 'var(--hm-domain-activity)',
                dash: '6 4',
              },
              {
                key: 'stress',
                label: t('form.stress'),
                unit: t('scale'),
                kind: 'line',
                color: 'var(--hm-domain-journal)',
                dash: '2 3',
              },
            ]}
          />

          <section
            aria-labelledby="mood-weekday"
            className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 id="mood-weekday" className="text-base font-semibold">
                {t('weekdayTitle')}
              </h2>
              <ConfidenceBadge level={level('ESTIMADO')} />
            </div>
            <p className="text-sm text-fg-muted">{t('weekdayDescription')}</p>
            <ul className="flex flex-col gap-2">
              {WEEK_ORDER.map((wd) => {
                const row = weekdays.find((w) => w.weekday === wd);
                const value = row?.mood ?? null;
                return (
                  <li
                    key={wd}
                    className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 text-sm"
                  >
                    <span>{t(`weekdays.${wd}`)}</span>
                    <span className="h-3 rounded-full bg-surface-muted" aria-hidden="true">
                      {value !== null ? (
                        <span
                          className="block h-3 rounded-full bg-mood"
                          style={{ width: `${(value / 5) * 100}%` }}
                        />
                      ) : null}
                    </span>
                    <span className="tabular">
                      {value !== null
                        ? t('weekdayValue', { value: formatDecimal(value), count: row?.count ?? 0 })
                        : t('weekdayNone')}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="mood-list" className="flex flex-col gap-3">
            <h2 id="mood-list" className="text-base font-semibold">
              {t('listTitle')}
            </h2>
            <ul className="flex flex-col gap-3">
              {[...records].reverse().map((r) => {
                const label = `${longDay(r.day)}, ${localTime(new Date(r.loggedAt))}`;
                return (
                  <li key={r.id} className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-semibold">{label}</h3>
                      <ConfidenceBadge level={level('INFORMADO')} />
                    </div>
                    <p className="tabular">
                      {t('entrySummary', { mood: r.mood, energy: r.energy, stress: r.stress })}
                    </p>
                    {r.emotions.length ? (
                      <p className="text-sm text-fg-muted">
                        {r.emotions.map((e) => t(`emotions.${e}`)).join(', ')}
                      </p>
                    ) : null}
                    {r.note ? <p className="mt-1 text-sm whitespace-pre-line">{r.note}</p> : null}
                    {own ? (
                      <div className="mt-2">
                        <EntryActions id={r.id} itemLabel={label} deleteAction={deleteMoodAction}>
                          <MoodForm
                            maxDateTime={maxDateTime}
                            values={{
                              id: r.id,
                              loggedAt: toLocalDateTime(new Date(r.loggedAt)),
                              mood: r.mood,
                              energy: r.energy,
                              stress: r.stress,
                              emotions: r.emotions,
                              note: r.note,
                            }}
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

      <SupportNotice />
    </div>
  );
}
