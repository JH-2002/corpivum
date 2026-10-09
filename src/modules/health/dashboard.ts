import { addDays, previousRange } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { delta } from '@/lib/stats';
import { change, latest, series, type BodyRecord } from '@/modules/body';
import {
  completionRate,
  currentStreak,
  dailyChecks,
  isScheduled,
  STREAK_LOOKBACK_DAYS,
  type HabitCheckRecord,
  type HabitRecord,
} from '@/modules/habits';
import { averageDurationMinutes, dailyHours, type SleepRecord } from '@/modules/sleep';
import { dashboardInsights, type ModuleInsights, type PeriodRecords } from '@/modules/insights';
import { computeWellbeingScore, type WellbeingScore } from '@/modules/wellbeing';
import type { HealthDataSource } from './source';

/**
 * Modelo de dados do Dashboard "Seu estado atual" (§11, §12). Tudo agregado no servidor (§41) e
 * serializável para os componentes de gráfico. Sem gráfico vazio: cada card traz `state`.
 */
export type CardState = 'ok' | 'no-data';
export type DashboardState = 'empty' | 'no-data' | 'partial' | 'ok';

export interface SparkPoint {
  day: string;
  value: number | null;
}

export interface SleepCard {
  state: CardState;
  avgMinutes: number | null;
  deltaMinutes: number | null;
  count: number;
  spark: SparkPoint[];
}

export interface HabitsCard {
  state: CardState;
  /** 0–100. */
  completion: number | null;
  deltaPoints: number | null;
  activeHabits: number;
  spark: SparkPoint[];
}

export interface BodyCard {
  state: CardState;
  weightKg: number | null;
  weightDay: string | null;
  changeKg: number | null;
  spark: SparkPoint[];
}

export interface TodayHabit {
  id: string;
  name: string;
  done: boolean;
  scheduled: boolean;
  streak: number | null;
}

export interface CombinedPoint {
  day: string;
  sleepHours: number | null;
}

export interface DashboardData {
  source: 'own' | 'demo';
  state: DashboardState;
  today: string;
  range: DateRange;
  previous: DateRange;
  score: WellbeingScore;
  previousScore: WellbeingScore;
  /** Resumo em texto e destaques por regras (ADR-0025). */
  insights: ModuleInsights;
  cards: {
    sleep: SleepCard;
    habits: HabitsCard;
    body: BodyCard;
  };
  combined: CombinedPoint[];
  todayHabits: TodayHabit[];
  streaksEnabled: boolean;
}

interface Loaded extends PeriodRecords {
  body: BodyRecord[];
}

async function load(
  source: HealthDataSource,
  range: DateRange,
  habits: HabitRecord[],
): Promise<Loaded> {
  const [sleep, checks, body] = await Promise.all([
    source.sleep(range),
    source.checks(range),
    source.body(range),
  ]);
  const loggedDays = new Set<string>([
    ...sleep.map((r) => r.day),
    ...checks.map((r) => r.day),
    ...body.map((r) => r.day),
  ]);
  return { range, sleep, habits, checks, body, loggedDays };
}

/** Registros do Índice: os mesmos do período, com a constância contada sem as medições do corpo. */
function scoreInput(period: Loaded): Loaded {
  const bodyOnly = new Set(period.body.map((r) => r.day));
  for (const r of [...period.sleep, ...period.checks]) bodyOnly.delete(r.day);
  return {
    ...period,
    loggedDays: new Set([...period.loggedDays].filter((d) => !bodyOnly.has(d))),
  };
}

function toSpark(points: Array<{ day: string; value: number | null }>): SparkPoint[] {
  return points.map((p) => ({ day: p.day, value: p.value }));
}

function sleepCard(now: SleepRecord[], before: SleepRecord[], range: DateRange): SleepCard {
  const avg = averageDurationMinutes(now);
  return {
    state: now.length ? 'ok' : 'no-data',
    avgMinutes: avg,
    deltaMinutes: delta(avg, averageDurationMinutes(before)),
    count: now.length,
    spark: toSpark(dailyHours(now, range).map((d) => ({ day: d.day, value: d.hours }))),
  };
}

function habitsCard(
  habits: HabitRecord[],
  now: HabitCheckRecord[],
  before: HabitCheckRecord[],
  range: DateRange,
  prev: DateRange,
): HabitsCard {
  const rate = completionRate(habits, now, range);
  const prevRate = completionRate(habits, before, prev);
  const active = habits.filter((h) => !h.archived);
  return {
    state: rate === null ? 'no-data' : 'ok',
    completion: rate === null ? null : Math.round(rate * 100),
    deltaPoints: rate === null || prevRate === null ? null : Math.round((rate - prevRate) * 100),
    activeHabits: active.length,
    spark: toSpark(dailyChecks(habits, now, range).map((d) => ({ day: d.day, value: d.done }))),
  };
}

function bodyCard(now: BodyRecord[]): BodyCard {
  const w = latest(now, 'weightKg');
  return {
    state: w ? 'ok' : 'no-data',
    weightKg: w?.value ?? null,
    weightDay: w?.day ?? null,
    changeKg: change(now, 'weightKg'),
    spark: series(now, 'weightKg').map((p) => ({ day: p.day, value: p.value })),
  };
}

/** Carrega e agrega o dashboard do período (e do período anterior, para variação e tendência). */
export async function buildDashboard(
  source: HealthDataSource,
  range: DateRange,
  today: string,
): Promise<DashboardData> {
  const prev = previousRange(range);
  const habits = await source.habits();
  const [now, before, streaksEnabled, hasAny] = await Promise.all([
    load(source, range, habits),
    load(source, prev, habits),
    source.streaksEnabled(),
    source.hasAnyRecord(),
  ]);

  // O Índice não usa peso nem medidas, nem para a constância: pesar mais vezes não sobe o Índice (LEG-M06).
  const score = computeWellbeingScore(scoreInput(now));
  const previousScore = computeWellbeingScore(scoreInput(before));
  const cards = {
    sleep: sleepCard(now.sleep, before.sleep, range),
    habits: habitsCard(habits, now.checks, before.checks, range, prev),
    body: bodyCard(now.body),
  };

  const combined = dailyHours(now.sleep, range).map((d) => ({
    day: d.day,
    sleepHours: d.hours,
  }));

  // Hábitos de hoje só fazem sentido se o período inclui hoje.
  const todayChecks = await source.checks({ from: today, to: today });
  const streakChecks = streaksEnabled
    ? await source.checks({ from: addDays(today, -STREAK_LOOKBACK_DAYS), to: today })
    : [];
  const todayHabits: TodayHabit[] = habits
    .filter((h) => !h.archived)
    .map((h) => ({
      id: h.id,
      name: h.name,
      done: todayChecks.some((c) => c.habitId === h.id),
      scheduled: isScheduled(h, today),
      streak: streaksEnabled ? currentStreak(h, streakChecks, today) : null,
    }));

  // "Parcial" = algum domínio sem registro no período. A atividade (fora do Índice v1 por não existir
  // ainda) não conta aqui; o card do Índice mostra os próprios componentes fora do cálculo.
  const hasData = now.loggedDays.size > 0;
  const missingDomain = Object.values(cards).some((c) => c.state === 'no-data');
  const state: DashboardState = !hasAny
    ? 'empty'
    : !hasData
      ? 'no-data'
      : missingDomain
        ? 'partial'
        : 'ok';

  return {
    source: source.kind,
    state,
    today,
    range,
    previous: prev,
    score,
    previousScore,
    insights: dashboardInsights(now, before, today),
    cards,
    combined,
    todayHabits,
    streaksEnabled,
  };
}
