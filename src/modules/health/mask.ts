import { BODY_FIELDS, type BodyField, type BodyRecord } from '@/modules/body';
import type { GoalMetric, GoalProgress, GoalRecord } from '@/modules/goals';
import type { MealRecord } from '@/modules/nutrition';
import type { TimelineDay } from '@/modules/timeline';
import type { DashboardData } from './dashboard';

/**
 * Modo privacidade no servidor (ADR-0035, LEG-M06): os números do corpo (peso, medidas, altura, gordura
 * corporal) e as calorias saem dos dados ANTES de chegar às telas, para não irem ao HTML nem às props dos
 * Client Components. Fica o que não é valor: dias, horários, quantidade de registros (PR3-B3).
 * Funções puras; as telas leem o cookie com `readPrivacyMode` e chamam a que precisam.
 */

const NO_BODY_VALUES = Object.fromEntries(BODY_FIELDS.map((f) => [f, null])) as Record<
  BodyField,
  null
>;

/** Medições sem nenhum valor: só id, instante e dia. */
export function maskBodyRecords(records: readonly BodyRecord[]): BodyRecord[] {
  return records.map((r) => ({
    id: r.id,
    measuredAt: r.measuredAt,
    day: r.day,
    ...NO_BODY_VALUES,
  }));
}

/** Card do corpo sem peso, variação nem minigráfico. */
export function maskDashboard(data: DashboardData): DashboardData {
  return {
    ...data,
    cards: {
      ...data.cards,
      body: { ...data.cards.body, weightKg: null, changeKg: null, spark: [] },
    },
  };
}

/** Timeline: medição do corpo sem peso nem variação. */
export function maskTimeline(days: readonly TimelineDay[]): TimelineDay[] {
  return days.map((d) => ({
    ...d,
    items: d.items.map((item) =>
      item.kind === 'body' ? { ...item, weightKg: null, weightChangeKg: null } : item,
    ),
  }));
}

/** Refeições sem a estimativa de calorias. */
export function maskMeals(meals: readonly MealRecord[]): MealRecord[] {
  return meals.map((m) => ({ ...m, kcalEstimate: null }));
}

/** Metas cujo valor é do corpo ou de calorias: no modo privacidade, nem alvo nem progresso aparecem. */
export const BODY_VALUE_GOAL_METRICS: readonly GoalMetric[] = ['weight_kg', 'kcal_reference_day'];

export function isBodyValueGoal(metric: GoalMetric): boolean {
  return BODY_VALUE_GOAL_METRICS.includes(metric);
}

/** Progresso sem o valor atual, a variação nem o alvo das metas de peso e de calorias. */
export function maskGoalProgress(
  progress: readonly GoalProgress[],
  metricOf: (goalId: string) => GoalMetric | undefined,
): GoalProgress[] {
  return progress.map((p) => {
    const metric = metricOf(p.goalId);
    return metric && isBodyValueGoal(metric)
      ? { ...p, current: null, target: 0, ratio: 0, reached: false, weightChangeKg: null }
      : p;
  });
}

/**
 * Alvo zerado e sem o peso de partida nas metas de peso e de calorias (a tela não mostra nem edita essas
 * metas no modo).
 */
export function maskGoals(goals: readonly GoalRecord[]): GoalRecord[] {
  return goals.map((g) =>
    isBodyValueGoal(g.metric) ? { ...g, targetValue: 0, startValue: null } : g,
  );
}

/** Tela de corpo e twin: registros sem valores e sem a última altura. */
export function maskBodyScreen(records: readonly BodyRecord[]): {
  records: BodyRecord[];
  latestHeightCm: null;
} {
  return { records: maskBodyRecords(records), latestHeightCm: null };
}

/** Tela de alimentação (`loadNutrition`): sem a estimativa de calorias nas refeições. */
export function maskNutritionScreen<
  D extends { meals: readonly MealRecord[]; previousMeals: readonly MealRecord[] },
>(data: D): D {
  return { ...data, meals: maskMeals(data.meals), previousMeals: maskMeals(data.previousMeals) };
}

/** Tela de metas (`loadGoals`): sem alvo nem progresso das metas de peso e de calorias. */
export function maskGoalsScreen<
  D extends { goals: readonly GoalRecord[]; progress: readonly GoalProgress[] },
>(data: D): D {
  const metric = new Map(data.goals.map((g) => [g.id, g.metric]));
  return {
    ...data,
    goals: maskGoals(data.goals),
    progress: maskGoalProgress(data.progress, (id) => metric.get(id)),
  };
}
