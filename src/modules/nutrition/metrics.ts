import { eachDay } from '@/lib/dates';
import { mean, round } from '@/lib/stats';
import type { DateRange } from '@/lib/period';
import type { MealPerception, MealRecord, WaterRecord } from './types';

/**
 * Métricas de alimentação (§25), funções puras. Descrevem a regularidade do registro, a água e as
 * percepções informadas. Não avaliam a comida nem comparam com referências populacionais (LEG-M07).
 */

/** Dias do intervalo com pelo menos uma refeição registrada. */
export function daysWithMeals(meals: MealRecord[], range: DateRange): number {
  return new Set(meals.filter((m) => m.day >= range.from && m.day <= range.to).map((m) => m.day))
    .size;
}

/** Refeições registradas por dia do intervalo. */
export function dailyMealCounts(
  meals: MealRecord[],
  range: DateRange,
): Array<{ day: string; meals: number | null }> {
  const byDay = new Map<string, number>();
  for (const m of meals) byDay.set(m.day, (byDay.get(m.day) ?? 0) + 1);
  return eachDay(range).map((day) => ({ day, meals: byDay.get(day) ?? null }));
}

/** Água (ml) por dia do intervalo; `null` nos dias sem registro. */
export function dailyWaterMl(
  water: WaterRecord[],
  range: DateRange,
): Array<{ day: string; ml: number | null }> {
  const byDay = new Map<string, number>();
  for (const w of water) byDay.set(w.day, (byDay.get(w.day) ?? 0) + w.ml);
  return eachDay(range).map((day) => ({ day, ml: byDay.get(day) ?? null }));
}

/** Média de água (ml) nos dias com registro de água. */
export function averageWaterMl(water: WaterRecord[]): number | null {
  const byDay = new Map<string, number>();
  for (const w of water) byDay.set(w.day, (byDay.get(w.day) ?? 0) + w.ml);
  const m = mean([...byDay.values()]);
  return m === null ? null : Math.round(m);
}

/** Média de uma percepção (1–5) nas refeições que a informaram. */
export function averagePerception(meals: MealRecord[], field: MealPerception): number | null {
  const m = mean(meals.flatMap((r) => (r[field] === null ? [] : [r[field]])));
  return m === null ? null : round(m, 1);
}

/**
 * Total das estimativas calóricas de um dia (só com a estimativa ligada; os registros chegam com `null`
 * quando ela está desligada). `null` = nenhuma estimativa no dia. Nunca vira "restante" nem "excedente".
 */
export function dayKcalTotal(meals: MealRecord[], day: string): number | null {
  const values = meals.flatMap((m) =>
    m.day === day && m.kcalEstimate !== null ? [m.kcalEstimate] : [],
  );
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0);
}
