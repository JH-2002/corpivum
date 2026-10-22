import { useFormatter, useTranslations } from 'next-intl';
import { deleteBodyAction } from '@/app/(app)/corpo/actions';
import { paddedDomain } from '@/components/charts/domain';
import { TimeChart } from '@/components/charts/TimeChart';
import { ExampleForm } from '@/components/forms/ExampleForm';
import { EntryActions } from '@/components/health/EntryActions';
import { formatDecimal } from '@/components/health/format';
import type { HealthMode } from '@/components/health/HealthPage';
import { PeriodInsights, summaryTextId } from '@/components/insights/PeriodInsights';
import { HiddenValuesNotice, Masked } from '@/components/privacy-mode/Masked';
import { StatTile } from '@/components/health/StatTile';
import { SupportNotice } from '@/components/health/SupportNotice';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { StateView } from '@/components/ui/StateView';
import { toLocalDateTime } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { bodyInsights, bodyInsightsHidden } from '@/modules/insights';
import { BODY_FIELDS, change, latest, type BodyField, type BodyRecord } from '@/modules/body';
import { BodyForm } from './BodyForm';

/** Faixa mínima dos eixos: ±2 kg e ±2 cm, para variações pequenas não parecerem grandes (LEG-M06). */
const MIN_SPAN = 4;

const GIRTHS: BodyField[] = ['waistCm', 'hipCm', 'armCm', 'thighCm', 'chestCm'];
const GIRTH_STYLE: Record<string, { color: string; dash?: string }> = {
  waistCm: { color: 'var(--hm-domain-body)' },
  hipCm: { color: 'var(--hm-series-violet)', dash: '6 4' },
  armCm: { color: 'var(--hm-domain-activity)', dash: '2 3' },
  thighCm: { color: 'var(--hm-series-amber)', dash: '8 3 2 3' },
  chestCm: { color: 'var(--hm-domain-sleep)', dash: '1 4' },
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
  const height = latest(records, 'heightCm')?.value ?? latestHeightCm;
  const weightChange = change(records, 'weightKg');
  const usedGirths = GIRTHS.filter((f) => records.some((r) => r[f] !== null));
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
          <BodyForm maxDateTime={maxDateTime} values={{ measuredAt: maxDateTime, ...empty }} />
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
        <StateView state="no-data" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label={t('stats.weight')}
              value={
                <Masked hidden={hidden}>
                  {weight ? `${formatDecimal(weight.value)} kg` : '—'}
                </Masked>
              }
              detail={weight ? t('stats.on', { date: longDay(weight.day) }) : undefined}
              badge={level('INFORMADO')}
            />
            <StatTile
              label={t('stats.change')}
              value={
                <Masked hidden={hidden}>
                  {weightChange !== null
                    ? `${weightChange > 0 ? '+' : ''}${formatDecimal(weightChange)} kg`
                    : '—'}
                </Masked>
              }
              detail={t('stats.changeHint')}
              badge={level('ESTIMADO')}
            />
            <StatTile
              label={t('stats.height')}
              value={
                <Masked hidden={hidden}>
                  {height !== null ? `${formatDecimal(height)} cm` : '—'}
                </Masked>
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
                    color: 'var(--hm-domain-body)',
                  },
                ]}
              />
              {usedGirths.length > 0 ? (
                <TimeChart
                  title={t('girthChart')}
                  badge={level('INFORMADO')}
                  guide="girth"
                  describedBy={summaryTextId('body')}
                  data={records.map((r) => ({
                    day: r.day,
                    ...Object.fromEntries(usedGirths.map((f) => [f, r[f]])),
                  }))}
                  leftDomain={paddedDomain(
                    records.flatMap((r) => usedGirths.map((f) => r[f])),
                    { minSpan: MIN_SPAN },
                  )}
                  series={usedGirths.map((f) => ({
                    key: f,
                    label: t(`fields.${f}`),
                    unit: 'cm',
                    kind: 'line' as const,
                    color: GIRTH_STYLE[f]?.color ?? 'var(--hm-domain-body)',
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
              <ul className="flex flex-col gap-3">
                {[...records].reverse().map((r) => (
                  <li key={r.id} className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-semibold">{longDay(r.day)}</h3>
                      <ConfidenceBadge level={level('INFORMADO')} />
                    </div>
                    <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                      {BODY_FIELDS.filter((f) => r[f] !== null).map((f) => (
                        <div key={f}>
                          <dt className="text-fg-muted">{t(`fields.${f}`)}</dt>
                          <dd className="tabular font-semibold">{formatDecimal(r[f] ?? 0)}</dd>
                        </div>
                      ))}
                    </dl>
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
            </section>
          )}
        </>
      )}
      {/* Apoio sempre visível no corpo (§48, ADR-0027; revisão de privacidade A1). */}
      <SupportNotice />
    </div>
  );
}
