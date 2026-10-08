import { eachDay } from '@/lib/dates';
import { mean, round, stdDev } from '@/lib/stats';
import type { DateRange } from '@/lib/period';
import type { SleepRecord } from './types';

/**
 * Métricas de sono (§20), funções puras. Descrevem regularidade e duração dos registros; não avaliam
 * saúde nem qualidade clínica do sono.
 */

export function durationMinutes(r: Pick<SleepRecord, 'bedAt' | 'wakeAt'>): number {
  return Math.round((Date.parse(r.wakeAt) - Date.parse(r.bedAt)) / 60_000);
}

/** Minutos desde a meia-noite local de "HH:MM". */
function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/**
 * Horário de deitar em minutos relativos à meia-noite, centrado nela: 23:00 → -60, 01:30 → 90.
 * Evita que 23:59 e 00:01 pareçam 24 h distantes.
 */
export function centeredMinutes(hhmm: string): number {
  const m = minutesOfDay(hhmm);
  return m >= 12 * 60 ? m - 24 * 60 : m;
}

export function averageDurationMinutes(records: SleepRecord[]): number | null {
  const m = mean(records.map(durationMinutes));
  return m === null ? null : Math.round(m);
}

/** Variação (desvio-padrão, em minutos) dos horários locais de deitar e de acordar. */
export function scheduleSpreadMinutes(
  records: Array<Pick<SleepRecord, 'bedTime' | 'wakeTime'>>,
): number | null {
  const bed = stdDev(records.map((r) => centeredMinutes(r.bedTime)));
  const wake = stdDev(records.map((r) => minutesOfDay(r.wakeTime)));
  if (bed === null || wake === null) return null;
  return Math.round((bed + wake) / 2);
}

export function averageQuality(records: SleepRecord[]): number | null {
  const m = mean(records.flatMap((r) => (r.quality === null ? [] : [r.quality])));
  return m === null ? null : round(m, 1);
}

/** Horas dormidas por dia do intervalo (soma, se houver mais de um registro no dia). */
export function dailyHours(
  records: SleepRecord[],
  range: DateRange,
): Array<{
  day: string;
  hours: number | null;
}> {
  const byDay = new Map<string, number>();
  for (const r of records) byDay.set(r.day, (byDay.get(r.day) ?? 0) + durationMinutes(r));
  return eachDay(range).map((day) => {
    const min = byDay.get(day);
    return { day, hours: min === undefined ? null : round(min / 60, 1) };
  });
}
