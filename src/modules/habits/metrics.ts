import { addDays, eachDay, weekday } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { round } from '@/lib/stats';
import type { HabitCheckRecord, HabitRecord } from './types';

/**
 * Métricas de hábitos (§22), funções puras. Tom neutro (LEG-F05): mostram cumprimento e sequência, sem
 * penalidade. A sequência (streak) só aparece se a pessoa não a desativou.
 */

/** O hábito é esperado neste dia? (`times_per_week` não tem dia fixo: sempre "pode".) */
export function isScheduled(habit: HabitRecord, day: string): boolean {
  if (day < habit.createdDay) return false;
  if (habit.frequency === 'weekdays') return habit.weekdays.includes(weekday(day));
  return true;
}

/** Ocorrências esperadas no intervalo, a partir do dia de criação. */
export function expectedOccurrences(habit: HabitRecord, range: DateRange): number {
  const days = eachDay(range).filter((d) => d >= habit.createdDay);
  if (habit.frequency === 'daily') return days.length;
  if (habit.frequency === 'weekdays') return days.filter((d) => isScheduled(habit, d)).length;
  return round(((habit.timesPerWeek ?? 0) * days.length) / 7, 1);
}

/** Cumprimento no intervalo (0–1, limitado a 1), ou `null` sem nada esperado. */
export function completionRate(
  habits: HabitRecord[],
  checks: HabitCheckRecord[],
  range: DateRange,
): number | null {
  const active = habits.filter((h) => !h.archived);
  const ids = new Set(active.map((h) => h.id));
  const expected = active.reduce((acc, h) => acc + expectedOccurrences(h, range), 0);
  if (expected <= 0) return null;
  const done = checks.filter(
    (c) => ids.has(c.habitId) && c.day >= range.from && c.day <= range.to,
  ).length;
  return Math.min(1, done / expected);
}

/** Checks por dia (todos os hábitos ativos), para gráfico. */
export function dailyChecks(
  habits: HabitRecord[],
  checks: HabitCheckRecord[],
  range: DateRange,
): Array<{ day: string; done: number; scheduled: number }> {
  const active = habits.filter((h) => !h.archived);
  const ids = new Set(active.map((h) => h.id));
  return eachDay(range).map((day) => ({
    day,
    done: checks.filter((c) => c.day === day && ids.has(c.habitId)).length,
    scheduled: active.filter((h) => h.frequency !== 'times_per_week' && isScheduled(h, day)).length,
  }));
}

/**
 * Sequência atual de dias esperados cumpridos. Hoje ainda sem check não quebra a sequência (o dia não
 * acabou). Para `times_per_week`, conta semanas (de 7 dias até hoje) que atingiram a meta.
 */
export function currentStreak(
  habit: HabitRecord,
  checks: HabitCheckRecord[],
  today: string,
): number {
  const done = new Set(checks.filter((c) => c.habitId === habit.id).map((c) => c.day));
  if (habit.frequency === 'times_per_week') {
    let weeks = 0;
    let end = today;
    for (;;) {
      const start = addDays(end, -6);
      if (end < habit.createdDay) break;
      const count = eachDay({ from: start, to: end }).filter((d) => done.has(d)).length;
      if (count < (habit.timesPerWeek ?? 1)) break;
      weeks += 1;
      end = addDays(start, -1);
    }
    return weeks;
  }
  let streak = 0;
  let day = done.has(today) ? today : addDays(today, -1);
  for (;;) {
    if (day < habit.createdDay) break;
    if (isScheduled(habit, day)) {
      if (!done.has(day)) break;
      streak += 1;
    }
    day = addDays(day, -1);
  }
  return streak;
}
