import type { DateRange } from '@/lib/period';
import {
  completionRate,
  dailyChecks,
  expectedOccurrences,
  longestStreak,
  type HabitCheckRecord,
  type HabitRecord,
} from '@/modules/habits';
import { cap, days, extremeDays, INSIGHT_RULES, int, periodArgs, select, sentence } from './rules';
import type { Highlight, InsightSentence, ModuleInsights } from './types';

export interface HabitsInsightsInput {
  /** Todos os hábitos (arquivados são ignorados). */
  habits: HabitRecord[];
  checks: HabitCheckRecord[];
  previousChecks: HabitCheckRecord[];
  range: DateRange;
  previousRange: DateRange;
  today: string;
  /** Sequências desativadas pela pessoa: nenhum texto sobre sequência (LEG-F05). */
  streaksEnabled: boolean;
}

/**
 * Resumo de hábitos (§22): marcações em relação à frequência prevista por cada hábito (a "meta" que a
 * pessoa definiu), comparação com o período anterior, dia com mais marcações e maior sequência. Tom
 * neutro, sem penalidade (LEG-F05).
 */
export function habitsInsights(input: HabitsInsightsInput): ModuleInsights {
  const { habits, checks, previousChecks, range, today, streaksEnabled } = input;
  const period = periodArgs(range, today);
  const base = { module: 'habits' as const, highlights: [] };
  const active = habits.filter((h) => !h.archived);
  const rate = completionRate(active, checks, range);
  if (active.length === 0 || rate === null) {
    return { ...base, state: 'empty', sentences: [sentence('empty')] };
  }

  const ids = new Set(active.map((h) => h.id));
  const done = checks.filter(
    (c) => ids.has(c.habitId) && c.day >= range.from && c.day <= range.to,
  ).length;
  const expected = Math.round(active.reduce((acc, h) => acc + expectedOccurrences(h, range), 0));
  const completion = sentence('completion', {
    ...period,
    done: int(done),
    expected: int(expected),
    percent: int(rate * 100),
  });
  if (expected < INSIGHT_RULES.minRecords) {
    return { ...base, state: 'partial', sentences: [completion, sentence('partial')] };
  }

  let compare: InsightSentence | null = null;
  let diff: number | null = null;
  const prevRate = completionRate(active, previousChecks, input.previousRange);
  if (prevRate !== null) {
    diff = rate - prevRate;
    const args = { diff: int(Math.abs(diff) * 100), days: period.days };
    compare =
      Math.abs(diff) < INSIGHT_RULES.habitPoints
        ? sentence('compareSame', args)
        : sentence(diff > 0 ? 'compareMore' : 'compareLess', args);
  }

  const perDay = dailyChecks(active, checks, range).map((d) => ({
    day: d.day,
    value: d.done > 0 ? d.done : null,
  }));
  const busiest = extremeDays(perDay, 'max', 1);
  const busiestCount = perDay.find((d) => d.day === busiest[0])?.value ?? 0;

  // Maior sequência entre os hábitos: dias para hábitos diários/por dia da semana, semanas para os demais.
  let streak = { value: 0, unit: 'days' };
  if (streaksEnabled) {
    for (const h of active) {
      const value = longestStreak(h, checks, range);
      const unit = h.frequency === 'times_per_week' ? 'weeks' : 'days';
      const better =
        unit === streak.unit
          ? value > streak.value
          : unit === 'days'
            ? value > streak.value * 7
            : value * 7 > streak.value;
      if (better) streak = { value, unit };
    }
  }
  const showStreak = streaksEnabled && streak.value >= 2;

  const highlights: Highlight[] = [];
  if (showStreak) {
    highlights.push({
      key: 'streak',
      value: int(streak.value),
      detail: sentence('streakUnit', { unit: select(streak.unit), count: int(streak.value) }),
      level: 'ESTIMADO',
    });
  }
  if (busiest[0] && busiestCount > 0) {
    highlights.push({
      key: 'busiest',
      value: int(busiestCount),
      detail: sentence('onDays', { when: days(busiest, range) }),
      level: 'INFORMADO',
    });
  }
  if (diff !== null) {
    highlights.push({
      key: 'change',
      value: int(Math.abs(diff) * 100),
      detail: sentence(diff >= 0 ? 'changeMore' : 'changeLess', { days: period.days }),
      level: 'ESTIMADO',
    });
  }

  return {
    ...base,
    state: 'ok',
    highlights,
    sentences: cap([
      completion,
      compare,
      busiest[0] && busiestCount > 0
        ? sentence('busiest', { when: days(busiest, range), count: int(busiestCount) })
        : null,
      showStreak
        ? sentence('streak', { unit: select(streak.unit), count: int(streak.value) })
        : null,
    ]),
  };
}
