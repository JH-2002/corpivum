'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useId } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type TooltipValueType,
} from 'recharts';
import { ChartGuide } from '@/components/charts/ChartGuide';
import { shortDay } from '@/components/charts/format';
import { usePrefersReducedMotion } from '@/components/charts/reduced-motion';
import { ChartTable } from '@/components/charts/TimeChart';
import { ConfidenceBadge, type ConfidenceLevel } from '@/components/ui/ConfidenceBadge';

export interface ScheduleRow {
  day: string;
  bedTime: string;
  wakeTime: string;
}

/** "HH:MM" → horas relativas à meia-noite (23:30 → -0,5; 07:00 → 7). */
function relHours(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const v = h + m / 60;
  return v >= 12 ? v - 24 : v;
}

/** Intervalo dos tiques do eixo de horário: sempre 2 h (revisão da 9d0). */
export const SCHEDULE_TICK_HOURS = 2;

/**
 * Eixo do horário de sono: do deitar mais cedo ao acordar mais tarde, arredondado para fora até múltiplos de 2 h,
 * com tiques a cada 2 h. Faixa mínima de 8 h para poucas noites parecidas não virarem barras do tamanho do eixo.
 */
export function scheduleAxis(rows: readonly ScheduleRow[]): {
  domain: [number, number];
  ticks: number[];
} {
  const step = SCHEDULE_TICK_HOURS;
  const values = rows.flatMap((r) => [relHours(r.bedTime), relHours(r.wakeTime)]);
  let lo = Math.floor(Math.min(...values) / step) * step;
  let hi = Math.ceil(Math.max(...values) / step) * step;
  while (hi - lo < 8) {
    hi += step;
    if (hi - lo < 8) lo -= step;
  }
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return { domain: [lo, hi], ticks };
}

function hourLabel(v: number): string {
  const h = ((Math.round(v) % 24) + 24) % 24;
  return `${String(h).padStart(2, '0')}h`;
}

/**
 * Horário de sono em barras flutuantes (§20): cada barra vai do horário de deitar ao de acordar.
 * Desenho decorativo; a tabela traz os horários exatos. Só é desenhado com registros.
 */
export function ScheduleChart({
  title,
  rows,
  badge,
  describedBy,
}: {
  title: string;
  rows: readonly ScheduleRow[];
  badge: ConfidenceLevel;
  /** Id do resumo em texto da tela (`aria-describedby`, ADR-0025). */
  describedBy?: string;
}) {
  const t = useTranslations('sleep');
  const format = useFormatter();
  const reduced = usePrefersReducedMotion();
  const headingId = useId();
  if (rows.length === 0) return null;
  const axis = scheduleAxis(rows);
  const data = rows.map((r) => ({ ...r, span: [relHours(r.bedTime), relHours(r.wakeTime)] }));
  const longDate = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });

  function TooltipBody({
    active,
    payload,
  }: TooltipContentProps<TooltipValueType, string | number>) {
    const row = payload?.[0]?.payload as ScheduleRow | undefined;
    if (!active || !row) return null;
    return (
      <div className="rounded-md border border-border bg-surface p-2 text-xs text-fg shadow-md">
        <p className="font-semibold">{longDate(row.day)}</p>
        <p className="tabular">{t('scheduleTooltip', { bed: row.bedTime, wake: row.wakeTime })}</p>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      aria-describedby={describedBy}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 id={headingId} className="text-base font-semibold">
          {title}
        </h2>
        <ConfidenceBadge level={badge} />
      </div>
      <ChartGuide id="sleepSchedule" badge={badge} />
      <div aria-hidden="true" className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} accessibilityLayer={false} margin={{ left: -8, right: 8 }}>
            <CartesianGrid stroke="var(--hm-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              tick={{ fill: 'var(--hm-fg-muted)', fontSize: 12 }}
              minTickGap={16}
            />
            <YAxis
              domain={axis.domain}
              ticks={axis.ticks}
              interval={0}
              tickFormatter={hourLabel}
              reversed
              tick={{ fill: 'var(--hm-fg-muted)', fontSize: 12 }}
              width={40}
            />
            <Tooltip content={TooltipBody} />
            <Bar dataKey="span" fill="var(--hm-chart-1)" radius={3} isAnimationActive={!reduced} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartTable
        title={title}
        data={rows.map((r) => ({ day: r.day, bed: r.bedTime, wake: r.wakeTime }))}
        series={[
          { key: 'bed', label: t('bedTime') },
          { key: 'wake', label: t('wakeTime') },
        ]}
        longDate={longDate}
      />
    </section>
  );
}
