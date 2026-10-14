import type { DateRange } from '@/lib/period';
import type { ActivityRecord } from '@/modules/activity';
import type { BodyRecord } from '@/modules/body';
import type { DemoDataset } from '@/modules/demo/generator';
import type { GoalRecord } from '@/modules/goals';
import type { HabitCheckRecord, HabitRecord } from '@/modules/habits';
import {
  DEFAULT_REMINDER_PREFS,
  type ReminderPrefs,
  type ReminderRecord,
} from '@/modules/notifications';
import type { MealRecord, WaterRecord } from '@/modules/nutrition';
import type { SleepRecord } from '@/modules/sleep';

/**
 * Fonte dos dados exibidos (ADR-0021). As telas leem sempre por aqui, sem saber se os dados são da
 * pessoa (`own`: serviços com consentimento + RLS) ou fictícios (`demo`: gerador em memória). Assim o
 * modo demo nunca grava nem mistura dado fictício com real.
 */
export interface HealthDataSource {
  kind: 'own' | 'demo';
  sleep(range: DateRange, opts?: { withText?: boolean }): Promise<SleepRecord[]>;
  habits(opts?: { includeArchived?: boolean }): Promise<HabitRecord[]>;
  checks(range: DateRange): Promise<HabitCheckRecord[]>;
  body(range: DateRange): Promise<BodyRecord[]>;
  latestHeightCm(): Promise<number | null>;
  latestWeightKg(): Promise<number | null>;
  meals(range: DateRange, opts?: { withText?: boolean }): Promise<MealRecord[]>;
  water(range: DateRange): Promise<WaterRecord[]>;
  activities(range: DateRange, opts?: { withText?: boolean }): Promise<ActivityRecord[]>;
  goals(opts?: { includeArchived?: boolean }): Promise<GoalRecord[]>;
  reminders(): Promise<ReminderRecord[]>;
  reminderPrefs(): Promise<ReminderPrefs>;
  /** Estimativa calórica ligada (padrão: desligada, LEG-M07). */
  calorieEstimateEnabled(): Promise<boolean>;
  streaksEnabled(): Promise<boolean>;
  /** Há algum registro de saúde, de qualquer data? (estado vazio × sem dados no período). */
  hasAnyRecord(): Promise<boolean>;
  /**
   * Executa várias leituras numa só transação com consentimento (dados próprios), em vez de uma
   * transação por consulta. No demo, só executa.
   */
  session<T>(fn: (source: HealthDataSource) => Promise<T>): Promise<T>;
}

const inRange = (day: string, range: DateRange) => day >= range.from && day <= range.to;

/** Fonte de demonstração: filtra o conjunto gerado. Sem rede, sem banco. */
export function createDemoSource(data: DemoDataset): HealthDataSource {
  return {
    kind: 'demo',
    sleep: async (range, opts) =>
      data.sleep
        .filter((r) => inRange(r.day, range))
        .map((r) => (opts?.withText ? r : { ...r, note: null })),
    habits: async () => data.habits,
    checks: async (range) => data.checks.filter((c) => inRange(c.day, range)),
    body: async (range) => data.body.filter((r) => inRange(r.day, range)),
    latestHeightCm: async () => data.body.find((r) => r.heightCm !== null)?.heightCm ?? null,
    latestWeightKg: async () => data.body.findLast((r) => r.weightKg !== null)?.weightKg ?? null,
    meals: async (range, opts) =>
      data.meals
        .filter((r) => inRange(r.day, range))
        .map((r) => (opts?.withText ? r : { ...r, description: null, note: null })),
    water: async (range) => data.water.filter((r) => inRange(r.day, range)),
    activities: async (range, opts) =>
      data.activities
        .filter((r) => inRange(r.day, range))
        .map((r) => (opts?.withText ? r : { ...r, note: null })),
    goals: async () => data.goals,
    reminders: async () => data.reminders,
    reminderPrefs: async () => DEFAULT_REMINDER_PREFS,
    calorieEstimateEnabled: async () => false,
    streaksEnabled: async () => true,
    hasAnyRecord: async () => true,
    session(fn) {
      return fn(this);
    },
  };
}
