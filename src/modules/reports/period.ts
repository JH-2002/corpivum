import { z } from 'zod';
import { addDays, weekStart } from '@/lib/dates';
import type { DateRange } from '@/lib/period';

/**
 * Períodos civis dos relatórios (§29): semana (segunda a domingo), mês e ano. A referência é um dia
 * qualquer dentro do período. Um período ainda em curso termina em `today` (sem dias futuros).
 */
export const REPORT_PERIODS = ['week', 'month', 'year'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
export const reportPeriodSchema = z.enum(REPORT_PERIODS);

const pad = (n: number) => String(n).padStart(2, '0');

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function calendarRange(kind: ReportPeriod, ref: string, today: string): DateRange {
  const [y = 0, m = 1] = ref.split('-').map(Number);
  const full: DateRange =
    kind === 'week'
      ? { from: weekStart(ref), to: addDays(weekStart(ref), 6) }
      : kind === 'month'
        ? { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}` }
        : { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: full.from, to: full.to > today ? today : full.to };
}

/** Período anterior de mesmo tipo (comparações do resumo, ADR-0025). */
export function previousCalendarRange(kind: ReportPeriod, range: DateRange): DateRange {
  const before = addDays(range.from, -1);
  return calendarRange(kind, before, before);
}

/** Referência válida: dia real, não futuro. */
export function isValidReference(ref: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ref) || ref > today) return false;
  const d = new Date(`${ref}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ref;
}
