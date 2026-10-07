import { previousRange } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { delta, round } from '@/lib/stats';
import { bmi, change, latest, series, type BodyRecord } from '@/modules/body';
import {
  completionRate,
  currentStreak,
  dailyChecks,
  isScheduled,
  type HabitCheckRecord,
  type HabitRecord,
} from '@/modules/habits';
import type { JournalRecord } from '@/modules/journal';
import { averageOf, dailyAverages, type MoodRecord } from '@/modules/mood';
import { averageDurationMinutes, dailyHours, type SleepRecord } from '@/modules/sleep';
import {
  buildSummary,
  computeWellbeingScore,
  type PeriodRecords,
  type Summary,
  type WellbeingScore,
} from '@/modules/wellbeing';
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

export interface MoodCard {
  state: CardState;
  avgMood: number | null;
  avgEnergy: number | null;
  deltaMood: number | null;
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
  bmi: number | null;
  spark: SparkPoint[];
}

export interface JournalCard {
  state: CardState;
  count: number;
  previousCount: number;
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
  mood: number | null;
  energy: number | null;
}

export interface DashboardData {
  source: 'own' | 'demo';
  state: DashboardState;
  today: string;
  range: DateRange;
  previous: DateRange;
  score: WellbeingScore;
  previousScore: WellbeingScore;
  summary: Summary;
  cards: {
    sleep: SleepCard;
    mood: MoodCard;
    habits: HabitsCard;
    body: BodyCard;
    journal: JournalCard;
  };
  combined: CombinedPoint[];
  todayHabits: TodayHabit[];
  streaksEnabled: boolean;
}

interface Loaded extends PeriodRecords {
  journal: JournalRecord[];
  body: BodyRecord[];
}

async function load(
  source: HealthDataSource,
  range: DateRange,
  habits: HabitRecord[],
): Promise<Loaded> {
  const [sleep, mood, checks, journal, body] = await Promise.all([
    source.sleep(range),
    source.mood(range),
    source.checks(range),
    source.journal(range),
    source.body(range),
  ]);
  const loggedDays = new Set<string>([
    ...sleep.map((r) => r.day),
    ...mood.map((r) => r.day),
    ...checks.map((r) => r.day),
    ...journal.map((r) => r.day),
    ...body.map((r) => r.day),
  ]);
  return { range, sleep, mood, habits, checks, journal, body, loggedDays };
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

function moodCard(now: MoodRecord[], before: MoodRecord[], range: DateRange): MoodCard {
  const avgMood = averageOf(now, 'mood');
  const d = delta(avgMood, averageOf(before, 'mood'));
  return {
    state: now.length ? 'ok' : 'no-data',
    avgMood,
    avgEnergy: averageOf(now, 'energy'),
    deltaMood: d === null ? null : round(d, 1),
    count: now.length,
    spark: toSpark(dailyAverages(now, range).map((x) => ({ day: x.day, value: x.mood }))),
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

function bodyCard(now: BodyRecord[], heightCm: number | null): BodyCard {
  const w = latest(now, 'weightKg');
  return {
    state: w ? 'ok' : 'no-data',
    weightKg: w?.value ?? null,
    weightDay: w?.day ?? null,
    changeKg: change(now, 'weightKg'),
    bmi: bmi(w?.value ?? null, latest(now, 'heightCm')?.value ?? heightCm),
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
  const [now, before, heightCm, streaksEnabled, hasAny] = await Promise.all([
    load(source, range, habits),
    load(source, prev, habits),
    source.latestHeightCm(),
    source.streaksEnabled(),
    source.hasAnyRecord(),
  ]);

  const score = computeWellbeingScore(now);
  const previousScore = computeWellbeingScore(before);
  const cards = {
    sleep: sleepCard(now.sleep, before.sleep, range),
    mood: moodCard(now.mood, before.mood, range),
    habits: habitsCard(habits, now.checks, before.checks, range, prev),
    body: bodyCard(now.body, heightCm),
    journal: {
      state: (now.journal.length ? 'ok' : 'no-data') as CardState,
      count: now.journal.length,
      previousCount: before.journal.length,
    },
  };

  const sleepByDay = new Map(dailyHours(now.sleep, range).map((d) => [d.day, d.hours]));
  const combined = dailyAverages(now.mood, range).map((d) => ({
    day: d.day,
    sleepHours: sleepByDay.get(d.day) ?? null,
    mood: d.mood,
    energy: d.energy,
  }));

  // Hábitos de hoje só fazem sentido se o período inclui hoje.
  const todayChecks = await source.checks({ from: today, to: today });
  const streakChecks = streaksEnabled
    ? await source.checks({ from: prev.from < range.from ? prev.from : range.from, to: today })
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
    summary: buildSummary(now, before),
    cards,
    combined,
    todayHabits,
    streaksEnabled,
  };
}
