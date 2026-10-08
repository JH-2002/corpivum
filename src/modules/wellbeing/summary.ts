import { rangeLength } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { round } from '@/lib/stats';
import { completionRate, type HabitCheckRecord, type HabitRecord } from '@/modules/habits';
import { averageOf, type MoodRecord } from '@/modules/mood';
import { averageDurationMinutes, type SleepRecord } from '@/modules/sleep';

/**
 * Resumo de uma frase do dashboard (§11.1), gerado por REGRAS (não por IA). Compara o período com o
 * anterior de mesmo tamanho e descreve a maior mudança, sem causa nem julgamento. O texto vem do i18n
 * (`dashboard.summary.*`) pela chave devolvida aqui.
 */
export const SUMMARY_RULES = Object.freeze({
  minRecords: 3,
  sleepMinutes: 20,
  moodPoints: 0.3,
  habitPoints: 0.1,
});

export type SummaryKey =
  'sleepUp' | 'sleepDown' | 'moodUp' | 'moodDown' | 'habitsUp' | 'habitsDown' | 'logging' | 'none';

export interface Summary {
  key: SummaryKey;
  /** Valores para interpolar (minutos, pontos, dias), sempre positivos. */
  values: { minutes?: number; points?: number; percent?: number; days?: number; total?: number };
}

export interface PeriodRecords {
  range: DateRange;
  sleep: SleepRecord[];
  mood: MoodRecord[];
  habits: HabitRecord[];
  checks: HabitCheckRecord[];
  loggedDays: ReadonlySet<string>;
}

export function buildSummary(current: PeriodRecords, previous: PeriodRecords): Summary {
  const enough = (a: unknown[], b: unknown[]) =>
    a.length >= SUMMARY_RULES.minRecords && b.length >= SUMMARY_RULES.minRecords;

  if (enough(current.sleep, previous.sleep)) {
    const diff =
      (averageDurationMinutes(current.sleep) ?? 0) - (averageDurationMinutes(previous.sleep) ?? 0);
    if (Math.abs(diff) >= SUMMARY_RULES.sleepMinutes) {
      return { key: diff > 0 ? 'sleepUp' : 'sleepDown', values: { minutes: Math.abs(diff) } };
    }
  }
  if (enough(current.mood, previous.mood)) {
    const diff = (averageOf(current.mood, 'mood') ?? 0) - (averageOf(previous.mood, 'mood') ?? 0);
    if (Math.abs(diff) >= SUMMARY_RULES.moodPoints) {
      return {
        key: diff > 0 ? 'moodUp' : 'moodDown',
        values: { points: round(Math.abs(diff), 1) },
      };
    }
  }
  const nowRate = completionRate(current.habits, current.checks, current.range);
  const prevRate = completionRate(previous.habits, previous.checks, previous.range);
  if (nowRate !== null && prevRate !== null) {
    const diff = nowRate - prevRate;
    if (Math.abs(diff) >= SUMMARY_RULES.habitPoints) {
      return {
        key: diff > 0 ? 'habitsUp' : 'habitsDown',
        values: { percent: Math.round(Math.abs(diff) * 100) },
      };
    }
  }
  if (current.loggedDays.size > 0) {
    return {
      key: 'logging',
      values: { days: current.loggedDays.size, total: rangeLength(current.range) },
    };
  }
  return { key: 'none', values: {} };
}
