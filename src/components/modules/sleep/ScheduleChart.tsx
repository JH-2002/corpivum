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
}: {
  title: string;
  rows: readonly ScheduleRow[];
  badge: ConfidenceLevel;
}) {
  const t = useTranslations('sleep');
  const format = useFormatter();
  const reduced = usePrefersReducedMotion();
  const headingId = useId();
  if (rows.length === 0) return null;
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
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 id={headingId} className="text-base font-semibold">
          {title}
        </h2>
        <ConfidenceBadge level={badge} />
      </div>
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
              domain={[-6, 14]}
              ticks={[-4, 0, 4, 8, 12]}
              tickFormatter={hourLabel}
              reversed
              tick={{ fill: 'var(--hm-fg-muted)', fontSize: 12 }}
              width={40}
            />
            <Tooltip content={TooltipBody} />
            <Bar
              dataKey="span"
              fill="var(--hm-domain-sleep)"
              radius={3}
              isAnimationActive={!reduced}
            />
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
