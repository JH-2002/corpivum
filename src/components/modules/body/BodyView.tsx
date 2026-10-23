import { useFormatter, useTranslations } from 'next-intl';
import { deleteBodyAction } from '@/app/(app)/corpo/actions';
import { paddedDomain } from '@/components/charts/domain';
import { TimeChart } from '@/components/charts/TimeChart';
import { ExampleForm } from '@/components/forms/ExampleForm';
import { NoRecords } from '@/components/health/NoRecords';
import { EntryActions } from '@/components/health/EntryActions';
import { formatMeasure, MEASURE_UNITS } from '@/components/health/format';
import type { HealthMode } from '@/components/health/HealthPage';
import { PeriodInsights, summaryTextId } from '@/components/insights/PeriodInsights';
import { HiddenValuesNotice, Masked } from '@/components/privacy-mode/Masked';
import { StatTile } from '@/components/health/StatTile';
import { WeeklyList } from '@/components/health/WeeklyList';
import { SupportNotice } from '@/components/health/SupportNotice';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { groupByWeek, toLocalDateTime } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { bodyInsights, bodyInsightsHidden } from '@/modules/insights';
import {
  BODY_FIELDS,
  changeRows,
  historyRows,
  latest,
  type BodyField,
  type BodyRecord,
} from '@/modules/body';
import { BodyForm } from './BodyForm';

/** Faixa mínima dos eixos: ±2 kg e ±2 cm, para variações pequenas não parecerem grandes (LEG-M06). */
const MIN_SPAN = 4;

const GIRTHS: BodyField[] = ['waistCm', 'hipCm', 'armCm', 'thighCm', 'chestCm'];
const GIRTH_STYLE: Record<string, { color: string; dash?: string }> = {
  waistCm: { color: 'var(--hm-chart-1)' },
  hipCm: { color: 'var(--hm-chart-2)', dash: '6 4' },
  armCm: { color: 'var(--hm-chart-3)', dash: '2 3' },
  thighCm: { color: 'var(--hm-chart-4)', dash: '8 3 2 3' },
  chestCm: { color: 'var(--hm-chart-5)', dash: '1 4' },
};

/** Exemplo do formulário na demonstração: o valor mais recente de cada campo (no modo privacidade, vazio). */
function exampleBody(records: BodyRecord[]): Record<BodyField, number | null> {
  return Object.fromEntries(
    BODY_FIELDS.map((field) => [field, latest(records, field)?.value ?? null]),
  ) as Record<BodyField, number | null>;
}

/**
 * Tela de peso e medidas (§23): registro, valores mais recentes, evolução e lista editável. Sem IMC: é valor
 * só interno dos guardrails, nunca exibido (LEG-M06, ADR-0032). No modo privacidade (`hidden`, ADR-0035) os
 * registros já chegam sem valores: blocos com "oculto", gráficos e lista trocados por um aviso.
 */
export function BodyView({
  records,
  latestHeightCm,
  range,
  today,
  mode,
  hidden = false,
}: {
  records: BodyRecord[];
  latestHeightCm: number | null;
  range: DateRange;
  today: string;
  mode: HealthMode;
  /** Modo privacidade: os registros chegam sem valores (`maskBodyRecords`). */
  hidden?: boolean;
}) {
  const t = useTranslations('body');
  const format = useFormatter();
  const own = mode === 'own';
  const level = (l: 'INFORMADO' | 'ESTIMADO') => (own ? l : 'DEMO');
  const maxDateTime = toLocalDateTime(new Date());
  const weight = latest(records, 'weightKg');
  const heightInPeriod = latest(records, 'heightCm');
  const height = heightInPeriod?.value ?? latestHeightCm;
  const usedGirths = GIRTHS.filter((f) => records.some((r) => r[f] !== null));
  const girthChanges = changeRows(records, usedGirths);
  const longDay = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: 'long', timeZone: 'UTC' });
  const empty = Object.fromEntries(BODY_FIELDS.map((f) => [f, null])) as Record<BodyField, null>;

  const insights = (hidden ? bodyInsightsHidden : bodyInsights)({ records, range, today });

  return (
    <div className="flex flex-col gap-6">
      <PeriodInsights insights={insights} demo={!own} />

      <section
        id="novo"
        aria-labelledby="body-new"
        className="scroll-mt-32 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="body-new" className="mb-3 text-base font-semibold">
          {t('newTitle')}
        </h2>
        {own ? (
          <BodyForm
            maxDateTime={maxDateTime}
            hideExamples={hidden}
            values={{ measuredAt: maxDateTime, ...empty }}
          />
        ) : (
          <ExampleForm publicDemo={mode === 'publicDemo'}>
            {/* Exemplo com a última medição da pessoa fictícia (nada de meta, LEG-M07). */}
            <BodyForm
              example
              maxDateTime={maxDateTime}
              values={{ measuredAt: maxDateTime, ...empty, ...exampleBody(records) }}
            />
          </ExampleForm>
        )}
      </section>

      {records.length === 0 ? (
        <NoRecords mode={mode} nextStep={t('nextStep')} />
      ) : (
        <>
          {/* Estado atual (peso e altura). A variação do peso fica só nos Destaques, sem repetir (revisão da 9d0). */}
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile
              label={t('stats.weight')}
              value={
                <Masked hidden={hidden}>{weight ? formatMeasure(weight.value, 'kg') : '—'}</Masked>
              }
              detail={weight ? t('stats.on', { date: longDay(weight.day) }) : undefined}
              badge={level('INFORMADO')}
            />
            <StatTile
              label={t('stats.height')}
              value={
                <Masked hidden={hidden}>
                  {height !== null ? formatMeasure(height, 'cm') : '—'}
                </Masked>
              }
              detail={
                heightInPeriod
                  ? t('stats.on', { date: longDay(heightInPeriod.day) })
                  : height !== null
                    ? t('stats.heightBefore')
                    : undefined
              }
              badge={level('INFORMADO')}
            />
          </div>

          {hidden ? (
            <HiddenValuesNotice title={t('weightChart')} />
          ) : (
            <>
              <TimeChart
                title={t('weightChart')}
                badge={level('INFORMADO')}
                guide="weight"
                describedBy={summaryTextId('body')}
                data={records.map((r) => ({ day: r.day, weightKg: r.weightKg }))}
                leftDomain={paddedDomain(
                  records.map((r) => r.weightKg),
                  { minSpan: MIN_SPAN },
                )}
                series={[
                  {
                    key: 'weightKg',
                    label: t('fields.weightKg'),
                    unit: 'kg',
                    kind: 'line',
                    color: 'var(--hm-chart-1)',
                  },
                ]}
              />
              {usedGirths.length > 0 ? (
                // Variação desde a primeira medição de cada região (ADR-0053): todas partem de zero, num só
                // eixo em cm com faixa mínima de ±2 cm. A tabela traz as medidas em si.
                // Selo ESTIMADO: o desenho é uma diferença calculada; as medidas informadas estão na tabela.
                <TimeChart
                  title={t('girthChart')}
                  description={t('girthChartHint')}
                  badge={level('ESTIMADO')}
                  guide="girth"
                  describedBy={summaryTextId('body')}
                  data={girthChanges}
                  tableData={records.map((r) => ({
                    day: r.day,
                    ...Object.fromEntries(usedGirths.map((f) => [f, r[f]])),
                  }))}
                  leftDomain={paddedDomain(
                    [
                      ...girthChanges.flatMap((r) => usedGirths.map((f) => r[f])),
                      -MIN_SPAN / 2,
                      MIN_SPAN / 2,
                    ],
                    { minSpan: MIN_SPAN },
                  )}
                  series={usedGirths.map((f) => ({
                    key: f,
                    label: t(`fields.${f}`),
                    unit: 'cm',
                    kind: 'line' as const,
                    signed: true,
                    color: GIRTH_STYLE[f]?.color ?? 'var(--hm-chart-1)',
                    dash: GIRTH_STYLE[f]?.dash,
                  }))}
                />
              ) : null}
            </>
          )}

          {hidden ? null : (
            <section aria-labelledby="body-list" className="flex flex-col gap-3">
              <h2 id="body-list" className="text-base font-semibold">
                {t('listTitle')}
              </h2>
              <p className="text-sm text-fg-muted">{t('historyIntro')}</p>
              <WeeklyList
                weeks={groupByWeek(historyRows(records), (row) => row.record.day).map((w) => ({
                  start: w.start,
                  end: w.end,
                  content: (
                    <ul className="flex flex-col gap-3">
                      {w.items.map(({ record: r, fields }) => (
                        <li key={r.id} className="rounded-lg border border-border bg-surface p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <h4 className="font-semibold">{longDay(r.day)}</h4>
                            <ConfidenceBadge level={level('INFORMADO')} />
                          </div>
                          {fields.length > 0 ? (
                            <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                              {fields.map((f) => (
                                <div key={f}>
                                  <dt className="text-fg-muted">{t(`fields.${f}`)}</dt>
                                  <dd className="tabular font-semibold">
                                    {formatMeasure(r[f] ?? 0, MEASURE_UNITS[f])}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            <p className="mt-1 text-sm text-fg-muted">{t('historyInTiles')}</p>
                          )}
                          {own ? (
                            <div className="mt-2">
                              <EntryActions
                                id={r.id}
                                itemLabel={longDay(r.day)}
                                deleteAction={deleteBodyAction}
                              >
                                <BodyForm
                                  maxDateTime={maxDateTime}
                                  values={{
                                    ...r,
                                    measuredAt: toLocalDateTime(new Date(r.measuredAt)),
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
          )}
        </>
      )}
      {/* Apoio sempre visível no corpo (§48, ADR-0027; revisão de privacidade A1). */}
      <SupportNotice />
    </div>
  );
}
