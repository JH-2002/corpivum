'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type TooltipValueType,
} from 'recharts';
import { ConfidenceBadge, type ConfidenceLevel } from '@/components/ui/ConfidenceBadge';
import { StateView } from '@/components/ui/StateView';
import { cn } from '@/lib/cn';
import { formatNumber, hasValues, shortDay, valueOf } from './format';
import { usePrefersReducedMotion } from './reduced-motion';

export interface ChartSeries {
  key: string;
  /** Rótulo já traduzido. */
  label: string;
  unit?: string;
  kind: 'line' | 'bar';
  /** Cor por token (ex.: `var(--hm-domain-sleep)`). Nunca é o único canal: há padrão de linha e rótulo. */
  color: string;
  /** Padrão de traço da linha (`stroke-dasharray`). */
  dash?: string;
  axis?: 'left' | 'right';
  decimals?: number;
}

/** Linha do gráfico: o dia e os valores das séries (número, ou `null` sem registro). */
export type ChartRow = { day: string };

export interface TimeChartProps<T extends ChartRow> {
  title: string;
  description?: string;
  data: readonly T[];
  series: readonly ChartSeries[];
  badge: ConfidenceLevel;
  height?: number;
  leftDomain?: [number, number];
  rightDomain?: [number, number];
  /** Estilo compacto (sem eixo Y à direita no mobile). */
  className?: string;
}

/**
 * Gráfico temporal (§13): tooltip com data, valor, unidade e selo; legenda clicável que alterna as séries
 * (botões com `aria-pressed`); padrão de traço além da cor; tabela alternativa acessível; sem animação com
 * `prefers-reduced-motion`. Sem nenhum valor no período, mostra o estado "sem dados" (nunca gráfico vazio).
 */
export function TimeChart<T extends ChartRow>({
  title,
  description,
  data,
  series,
  badge,
  height = 260,
  leftDomain,
  rightDomain,
  className,
}: TimeChartProps<T>) {
  const t = useTranslations('charts');
  const tb = useTranslations('badges');
  const format = useFormatter();
  const reduced = usePrefersReducedMotion();
  const headingId = useId();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const visible = series.filter((s) => !hidden.has(s.key));
  const hasData = hasValues(
    data,
    series.map((s) => s.key),
  );
  const hasRight = visible.some((s) => s.axis === 'right');

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      // Ao menos uma série continua visível.
      else if (series.length - prev.size > 1) next.add(key);
      return next;
    });
  }

  const longDate = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });

  function TooltipBody({
    active,
    payload,
    label,
  }: TooltipContentProps<TooltipValueType, string | number>) {
    if (!active || !payload?.length || typeof label !== 'string') return null;
    return (
      <div className="rounded-md border border-border bg-surface p-2 text-xs text-fg shadow-md">
        <p className="font-semibold">{longDate(label)}</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {payload.map((p) => {
            const s = series.find((x) => x.key === p.dataKey);
            if (!s || typeof p.value !== 'number') return null;
            return (
              <li key={s.key} className="tabular">
                {s.label}: <strong>{formatNumber(p.value, s.decimals)}</strong>
                {s.unit ? ` ${s.unit}` : ''}
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-fg-muted">{t('origin', { badge: tb(badge) })}</p>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-surface p-4',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold">
            {title}
          </h2>
          {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
        </div>
        <ConfidenceBadge level={badge} />
      </div>

      {!hasData ? (
        <StateView state="no-data" />
      ) : (
        <>
          <div role="group" aria-label={t('legend')} className="flex flex-wrap gap-2">
            {series.map((s) => {
              const on = !hidden.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(s.key)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm',
                    on
                      ? 'border-border-strong bg-surface'
                      : 'border-border text-fg-muted line-through',
                  )}
                >
                  <svg width="24" height="10" aria-hidden="true">
                    {s.kind === 'bar' ? (
                      <rect x="6" y="0" width="12" height="10" fill={s.color} />
                    ) : (
                      <line
                        x1="0"
                        y1="5"
                        x2="24"
                        y2="5"
                        stroke={s.color}
                        strokeWidth="3"
                        strokeDasharray={s.dash}
                      />
                    )}
                  </svg>
                  {s.label}
                  <span className="sr-only">{on ? t('seriesOn') : t('seriesOff')}</span>
                </button>
              );
            })}
          </div>

          {/* O desenho é complementar: a tabela abaixo traz os mesmos valores para leitor de tela. */}
          <div aria-hidden="true" style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={[...data]}
                margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
                accessibilityLayer={false}
              >
                <CartesianGrid stroke="var(--hm-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={shortDay}
                  tick={{ fill: 'var(--hm-fg-muted)', fontSize: 12 }}
                  minTickGap={16}
                />
                <YAxis
                  yAxisId="left"
                  domain={leftDomain ?? ['auto', 'auto']}
                  tick={{ fill: 'var(--hm-fg-muted)', fontSize: 12 }}
                  width={44}
                />
                {hasRight ? (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={rightDomain ?? ['auto', 'auto']}
                    tick={{ fill: 'var(--hm-fg-muted)', fontSize: 12 }}
                    width={36}
                  />
                ) : null}
                <Tooltip content={TooltipBody} cursor={{ stroke: 'var(--hm-border-strong)' }} />
                {visible.map((s) =>
                  s.kind === 'bar' ? (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      yAxisId={s.axis ?? 'left'}
                      fill={s.color}
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={!reduced}
                    />
                  ) : (
                    <Line
                      key={s.key}
                      dataKey={s.key}
                      yAxisId={s.axis ?? 'left'}
                      stroke={s.color}
                      strokeWidth={2}
                      strokeDasharray={s.dash}
                      dot={{ r: 2 }}
                      connectNulls
                      isAnimationActive={!reduced}
                    />
                  ),
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <ChartTable title={title} data={data} series={series} longDate={longDate} />
        </>
      )}
    </section>
  );
}

/** Tabela alternativa acessível (§13): mesmos valores do gráfico. */
export function ChartTable({
  title,
  data,
  series,
  longDate,
}: {
  title: string;
  data: readonly ChartRow[];
  series: readonly Pick<ChartSeries, 'key' | 'label' | 'unit' | 'decimals'>[];
  longDate: (iso: string) => string;
}) {
  const t = useTranslations('charts');
  const rows = data.filter((row) =>
    series.some((s) => ['number', 'string'].includes(typeof valueOf(row, s.key))),
  );
  return (
    <details className="text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
        {t('showTable')}
      </summary>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-border p-2">
                {t('date')}
              </th>
              {series.map((s) => (
                <th key={s.key} scope="col" className="border-b border-border p-2">
                  {s.label}
                  {s.unit ? ` (${s.unit})` : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.day}>
                <th scope="row" className="border-b border-border p-2 font-normal">
                  {longDate(row.day)}
                </th>
                {series.map((s) => {
                  const v = valueOf(row, s.key);
                  return (
                    <td key={s.key} className="tabular border-b border-border p-2">
                      {typeof v === 'number'
                        ? formatNumber(v, s.decimals)
                        : typeof v === 'string'
                          ? v
                          : t('empty')}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
