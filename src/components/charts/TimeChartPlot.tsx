'use client';

import { useFormatter, useTranslations } from 'next-intl';
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
import type { ConfidenceLevel } from '@/components/ui/ConfidenceBadge';
import { useReveal, type RevealKind } from '@/lib/motion/reveal';
import { yAxisConfig } from './domain';
import { formatNumber, formatSigned, shortDay } from './format';
import type { ChartRow, ChartSeries } from './TimeChart';

/**
 * Desenho do `TimeChart` com o recharts, carregado sob demanda (§41). Decorativo para leitor de tela: o
 * contêiner é `aria-hidden` e a tabela alternativa do `TimeChart` traz os mesmos valores.
 */
export function TimeChartPlot({
  data,
  series,
  visible,
  badge,
  hasRight,
  leftDomain,
  rightDomain,
  entrance,
}: {
  data: readonly ChartRow[];
  series: readonly ChartSeries[];
  visible: readonly ChartSeries[];
  badge: ConfidenceLevel;
  hasRight: boolean;
  leftDomain?: [number, number];
  rightDomain?: [number, number];
  entrance: RevealKind;
}) {
  const t = useTranslations('charts');
  const tb = useTranslations('badges');
  const format = useFormatter();
  const { ref, revealProps } = useReveal<HTMLDivElement>(entrance);
  const longDate = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });
  // Eixo de variação (todas as séries com sinal): rótulos com +/−, e o zero é o ponto de partida.
  const axisFormat = (axis: 'left' | 'right') => {
    const onAxis = visible.filter((s) => (s.axis ?? 'left') === axis);
    return onAxis.length > 0 && onAxis.every((s) => s.signed) ? formatSigned : formatNumber;
  };
  const leftFormat = axisFormat('left');
  const rightFormat = axisFormat('right');
  const left = yAxisConfig(data, visible, 'left', leftDomain, leftFormat);
  const right = yAxisConfig(data, visible, 'right', rightDomain, rightFormat);

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
                {s.label}:{' '}
                <strong>{(s.signed ? formatSigned : formatNumber)(p.value, s.decimals)}</strong>
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
    <div ref={ref} className="size-full" {...revealProps}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={[...data]}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
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
            domain={left.domain}
            ticks={left.ticks}
            allowDecimals={left.allowDecimals}
            tickFormatter={(v: number) => leftFormat(v, left.decimals)}
            tick={{ fill: 'var(--hm-fg-muted)', fontSize: 12 }}
            width={left.width}
          />
          {hasRight ? (
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={right.domain}
              ticks={right.ticks}
              allowDecimals={right.allowDecimals}
              tickFormatter={(v: number) => rightFormat(v, right.decimals)}
              tick={{ fill: 'var(--hm-fg-muted)', fontSize: 12 }}
              width={right.width}
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
                isAnimationActive={false}
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
                isAnimationActive={false}
              />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
