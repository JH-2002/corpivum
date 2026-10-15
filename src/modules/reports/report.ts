import { rangeLength, weekStart, weekToDate } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { dailyMinutes, totalMinutes } from '@/modules/activity';
import { series } from '@/modules/body';
import { goalProgress, type GoalMetric } from '@/modules/goals';
import { goalDataFor } from '@/modules/health/screens';
import type { HealthDataSource } from '@/modules/health/source';
import {
  activityInsights,
  bodyInsights,
  bodyInsightsHidden,
  goalsInsights,
  habitsInsights,
  nutritionInsights,
  sleepInsights,
  type ModuleInsights,
} from '@/modules/insights';
import { dailyHours } from '@/modules/sleep';
import { computeWellbeingScore, type WellbeingScore } from '@/modules/wellbeing';
import { previousCalendarRange, type ReportPeriod } from './period';

/**
 * Modelo do relatório semanal, mensal ou anual (§29, ADR-0032), sem I/O além da fonte de dados. O mesmo modelo
 * vira a tela (`/relatorios`) e o PDF. Conteúdo: resumo por domínio (camada explicativa por regras, ADR-0025),
 * gráficos principais, metas, Índice de Bem-Estar e contagens. Só descreve o período: sem sugestão (ADR-0030).
 *
 * - Valores só internos (IMC, relação cintura/quadril) nunca entram (LEG-M06).
 * - `hideBodyValues`: sem peso, medidas, altura nem calorias; o corpo vira só a quantidade de medições.
 * - Metas de peso e de calorias aparecem só na contagem do resumo, nunca com número (LEG-M06, LEG-M07).
 */
export type ChartId = 'sleep' | 'activity' | 'weight';

export interface ReportPoint {
  /** Dia, ou segunda-feira da semana quando o período passa de `WEEKLY_AFTER_DAYS`. */
  day: string;
  value: number | null;
}

export interface ReportChart {
  id: ChartId;
  unit: 'h' | 'min' | 'kg';
  bucket: 'day' | 'week';
  badge: 'INFORMADO' | 'ESTIMADO';
  points: ReportPoint[];
}

export interface ReportGoal {
  metric: GoalMetric;
  current: number | null;
  target: number;
  reached: boolean;
}

export interface ReportModel {
  period: ReportPeriod;
  range: DateRange;
  previous: DateRange;
  today: string;
  source: 'own' | 'demo';
  hideBodyValues: boolean;
  score: WellbeingScore;
  sections: ModuleInsights[];
  charts: ReportChart[];
  goals: ReportGoal[];
  hasData: boolean;
}

/** Acima disto, os gráficos usam a média por semana (um ano = 53 pontos em vez de 366). */
export const WEEKLY_AFTER_DAYS = 62;

const HIDDEN_GOAL_METRICS: readonly GoalMetric[] = ['weight_kg', 'kcal_reference_day'];

export function bucketPoints(
  points: readonly ReportPoint[],
  range: DateRange,
  mode: 'mean' | 'sum',
): { bucket: 'day' | 'week'; points: ReportPoint[] } {
  if (rangeLength(range) <= WEEKLY_AFTER_DAYS) return { bucket: 'day', points: [...points] };
  const weeks = new Map<string, number[]>();
  for (const p of points) {
    const key = weekStart(p.day);
    const list = weeks.get(key) ?? [];
    if (p.value !== null) list.push(p.value);
    weeks.set(key, list);
  }
  return {
    bucket: 'week',
    points: [...weeks.entries()].map(([day, values]) => ({
      day,
      value:
        values.length === 0
          ? null
          : mode === 'sum'
            ? values.reduce((a, b) => a + b, 0)
            : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
    })),
  };
}

export async function buildReport(
  source: HealthDataSource,
  input: { period: ReportPeriod; range: DateRange; today: string; hideBodyValues: boolean },
): Promise<ReportModel> {
  const { period, range, today, hideBodyValues } = input;
  const previous = previousCalendarRange(period, range);
  return source.session(async (s) => {
    const [
      sleep,
      prevSleep,
      habits,
      checks,
      prevChecks,
      body,
      meals,
      prevMeals,
      water,
      activities,
      prevActivities,
      goals,
      streaksEnabled,
    ] = await Promise.all([
      s.sleep(range),
      s.sleep(previous),
      s.habits(),
      s.checks(range),
      s.checks(previous),
      s.body(range),
      s.meals(range),
      s.meals(previous),
      s.water(range),
      s.activities(range),
      s.activities(previous),
      s.goals(),
      s.streaksEnabled(),
    ]);

    const goalData = await goalDataFor(s, weekToDate(today));
    const progress = goals.map((g) => goalProgress(g, goalData, today));
    const weeklyGoal = goals.find((g) => g.metric === 'activity_minutes_week');
    const week = weekToDate(today);

    const sections: ModuleInsights[] = [
      sleepInsights({ records: sleep, previous: prevSleep, range, today }),
      habitsInsights({
        habits,
        checks,
        previousChecks: prevChecks,
        range,
        previousRange: previous,
        today,
        streaksEnabled,
      }),
      (hideBodyValues ? bodyInsightsHidden : bodyInsights)({ records: body, range, today }),
      nutritionInsights({ meals, water, previousMeals: prevMeals, range, today }),
      activityInsights({
        records: activities,
        previous: prevActivities,
        range,
        today,
        weeklyGoal: weeklyGoal
          ? { current: totalMinutes(goalData.activities, week), target: weeklyGoal.targetValue }
          : null,
      }),
      goalsInsights({ goals, progress }),
    ];

    const charts: ReportChart[] = [];
    const sleepPoints = bucketPoints(
      dailyHours(sleep, range).map((d) => ({ day: d.day, value: d.hours })),
      range,
      'mean',
    );
    if (sleep.length > 0)
      charts.push({ id: 'sleep', unit: 'h', badge: 'INFORMADO', ...sleepPoints });
    if (activities.length > 0) {
      const points = bucketPoints(
        dailyMinutes(activities, range).map((d) => ({ day: d.day, value: d.minutes })),
        range,
        'sum',
      );
      charts.push({ id: 'activity', unit: 'min', badge: 'INFORMADO', ...points });
    }
    const weights = series(body, 'weightKg');
    if (!hideBodyValues && weights.length > 0) {
      const points = bucketPoints(weights, range, 'mean');
      charts.push({ id: 'weight', unit: 'kg', badge: 'INFORMADO', ...points });
    }

    const byId = new Map(progress.map((p) => [p.goalId, p]));
    const reportGoals: ReportGoal[] = goals
      .filter((g) => g.status === 'active' && !HIDDEN_GOAL_METRICS.includes(g.metric))
      .map((g) => {
        const p = byId.get(g.id);
        return {
          metric: g.metric,
          current: p?.current ?? null,
          target: g.targetValue,
          reached: p?.reached ?? false,
        };
      });

    return {
      period,
      range,
      previous,
      today,
      source: s.kind,
      hideBodyValues,
      // Mesma regra do dashboard: a constância não conta medições do corpo (LEG-M06).
      score: computeWellbeingScore({
        range,
        sleep,
        habits,
        checks,
        loggedDays: new Set([...sleep.map((r) => r.day), ...checks.map((r) => r.day)]),
      }),
      sections,
      charts,
      goals: reportGoals,
      hasData:
        sleep.length +
          checks.length +
          body.length +
          meals.length +
          water.length +
          activities.length >
        0,
    };
  });
}
