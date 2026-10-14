import { addDays, daysBetween, weekStart, weekToDate } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { clamp, round } from '@/lib/stats';
import { sessionCount, totalMinutes, type ActivityRecord } from '@/modules/activity';
import type { BodyRecord } from '@/modules/body';
import { completionRate, type HabitCheckRecord, type HabitRecord } from '@/modules/habits';
import { dayKcalTotal, type MealRecord, type WaterRecord } from '@/modules/nutrition';
import { averageDurationMinutes, type SleepRecord } from '@/modules/sleep';
import type { GoalMetric, GoalRecord } from './types';

/**
 * Progresso das metas (§30), funções puras. A barra mostra o caminho até o alvo da própria pessoa, com
 * valor em texto (nunca só cor). Metas de peso: número, seta e palavra, sem sequência nem comemoração
 * (LEG-M06). Prazo encerrado sem alcançar = "prazo encerrado", em tom neutro (LEG-F05).
 */

/** Registros usados para medir as metas. */
export interface GoalData {
  sleep: SleepRecord[];
  activities: ActivityRecord[];
  habits: HabitRecord[];
  checks: HabitCheckRecord[];
  meals: MealRecord[];
  water: WaterRecord[];
  body: BodyRecord[];
  /** Peso mais recente, de qualquer data (metas de peso). */
  latestWeightKg: number | null;
}

/** Tolerância (kg) de uma meta de manutenção de peso. */
export const WEIGHT_MAINTENANCE_KG = 1;

export type GoalWindow = 'week' | 'day' | 'target';

export const WEEKLY_METRICS: ReadonlySet<GoalMetric> = new Set([
  'sleep_avg_minutes',
  'activity_minutes_week',
  'activity_sessions_week',
  'habit_completion_pct',
  'logging_days_week',
]);

export function windowOf(metric: GoalMetric): GoalWindow {
  if (metric === 'weight_kg') return 'target';
  if (metric === 'kcal_reference_day') return 'day';
  return 'week';
}

/**
 * Dias do intervalo com algum registro (metas de registro). Medidas do corpo NÃO contam: pesar-se não vira
 * conquista (LEG-M06, mesma regra do Índice, revisão M6).
 */
export function loggedDays(data: GoalData, range: DateRange): number {
  const days = new Set<string>();
  const add = (day: string) => {
    if (day >= range.from && day <= range.to) days.add(day);
  };
  for (const r of data.sleep) add(r.day);
  for (const r of data.activities) add(r.day);
  for (const r of data.meals) add(r.day);
  for (const r of data.water) add(r.day);
  for (const r of data.checks) add(r.day);
  return days.size;
}

/** Valor da métrica no intervalo (semana, dia) ou o peso atual. `null` = sem dado. */
export function measure(goal: GoalRecord, data: GoalData, range: DateRange): number | null {
  const inRange = <T extends { day: string }>(list: T[]) =>
    list.filter((r) => r.day >= range.from && r.day <= range.to);
  switch (goal.metric) {
    case 'sleep_avg_minutes':
      return averageDurationMinutes(inRange(data.sleep));
    case 'activity_minutes_week':
      return totalMinutes(data.activities, range);
    case 'activity_sessions_week':
      return sessionCount(data.activities, range);
    case 'habit_completion_pct': {
      const habit = data.habits.find((h) => h.id === goal.habitId);
      if (!habit) return null;
      const rate = completionRate([habit], data.checks, range);
      return rate === null ? null : Math.round(rate * 100);
    }
    case 'logging_days_week':
      return loggedDays(data, range);
    case 'kcal_reference_day':
      return dayKcalTotal(data.meals, range.to);
    case 'weight_kg':
      return data.latestWeightKg;
  }
}

export interface GoalProgress {
  goalId: string;
  window: GoalWindow;
  current: number | null;
  target: number;
  /** 0–1, para a barra. */
  ratio: number;
  reached: boolean;
  /** Prazo passou sem alcançar: tom neutro, com ajustar ou arquivar. */
  deadlinePassed: boolean;
  /** Peso: diferença atual − partida (número, seta e palavra), sem juízo. */
  weightChangeKg: number | null;
}

/** Progresso de uma meta hoje: semana corrente, dia corrente ou peso atual. */
export function goalProgress(goal: GoalRecord, data: GoalData, today: string): GoalProgress {
  const window = windowOf(goal.metric);
  const range: DateRange = window === 'day' ? { from: today, to: today } : weekToDate(today);
  const current = measure(goal, data, range);
  let ratio = 0;
  let reached = false;
  let weightChangeKg: number | null = null;
  if (goal.metric === 'weight_kg') {
    const start = goal.startValue;
    if (current !== null && start !== null) {
      weightChangeKg = round(current - start, 1);
      if (Math.abs(goal.targetValue - start) < 0.05) {
        reached = Math.abs(current - goal.targetValue) <= WEIGHT_MAINTENANCE_KG;
        ratio = reached ? 1 : 0;
      } else {
        ratio = clamp((current - start) / (goal.targetValue - start), 0, 1);
        reached = ratio >= 1;
      }
    }
  } else if (current !== null) {
    ratio = clamp(current / goal.targetValue, 0, 1);
    reached = current >= goal.targetValue;
  }
  return {
    goalId: goal.id,
    window,
    current,
    target: goal.targetValue,
    ratio,
    reached,
    deadlinePassed: goal.targetDay !== null && goal.targetDay < today && !reached,
    weightChangeKg,
  };
}

/**
 * Resultado de cada semana completa (segunda a domingo) do intervalo, a partir da criação da meta. Base
 * dos marcos "meta atingida" na timeline (só onde `allowsMilestone` permite).
 */
export function weeklyResults(
  goal: GoalRecord,
  data: GoalData,
  range: DateRange,
  today: string,
): Array<{ weekEnd: string; value: number | null; reached: boolean }> {
  if (!WEEKLY_METRICS.has(goal.metric)) return [];
  const out: Array<{ weekEnd: string; value: number | null; reached: boolean }> = [];
  const start = goal.createdDay > range.from ? goal.createdDay : range.from;
  // Primeira segunda-feira a partir da criação (ou do início do intervalo): semana inteira com a meta.
  const monday = weekStart(start);
  const first = monday < start ? addDays(monday, 7) : monday;
  for (let from = first; daysBetween(from, range.to) >= 0; from = addDays(from, 7)) {
    const to = addDays(from, 6);
    // Só semanas encerradas e inteiras dentro do intervalo.
    if (to >= today || to > range.to) continue;
    const value = measure(goal, data, { from, to });
    out.push({ weekEnd: to, value, reached: value !== null && value >= goal.targetValue });
  }
  return out;
}
