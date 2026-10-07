import { eachDay, weekday } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { mean, round } from '@/lib/stats';
import type { MoodRecord } from './types';

/** Métricas de humor/energia/estresse autorrelatados (§21). Descrevem registros; não avaliam saúde. */

export type MoodScale = 'mood' | 'energy' | 'stress';

export function averageOf(records: MoodRecord[], scale: MoodScale): number | null {
  const m = mean(records.map((r) => r[scale]));
  return m === null ? null : round(m, 1);
}

/** Média diária de cada escala ao longo do intervalo (dias sem registro = null). */
export function dailyAverages(
  records: MoodRecord[],
  range: DateRange,
): Array<{ day: string; mood: number | null; energy: number | null; stress: number | null }> {
  const byDay = new Map<string, MoodRecord[]>();
  for (const r of records) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
  return eachDay(range).map((day) => {
    const list = byDay.get(day) ?? [];
    return {
      day,
      mood: averageOf(list, 'mood'),
      energy: averageOf(list, 'energy'),
      stress: averageOf(list, 'stress'),
    };
  });
}

/** Média de humor por dia da semana (0 = domingo), com quantidade de registros. */
export function byWeekday(records: MoodRecord[]): Array<{
  weekday: number;
  mood: number | null;
  count: number;
}> {
  return [0, 1, 2, 3, 4, 5, 6].map((wd) => {
    const list = records.filter((r) => weekday(r.day) === wd);
    return { weekday: wd, mood: averageOf(list, 'mood'), count: list.length };
  });
}
