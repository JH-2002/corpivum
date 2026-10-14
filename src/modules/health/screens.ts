import { previousRange, weekToDate } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { totalMinutes } from '@/modules/activity';
import { goalProgress, type GoalData, type GoalProgress } from '@/modules/goals';
import type { HealthDataSource } from './source';

/**
 * Leituras das telas da Fase 4, iguais para dados próprios (consentimento + RLS) e demo (gerador em
 * memória). Cada tela lê numa só transação (`source.session`).
 */

export function loadNutrition(source: HealthDataSource, range: DateRange, today: string) {
  return source.session(async (s) => {
    const [meals, previousMeals, water, waterToday, estimateEnabled] = await Promise.all([
      s.meals(range, { withText: true }),
      s.meals(previousRange(range)),
      s.water(range),
      s.water({ from: today, to: today }),
      s.calorieEstimateEnabled(),
    ]);
    return { meals, previousMeals, water, waterToday, estimateEnabled };
  });
}

export function loadActivity(source: HealthDataSource, range: DateRange, today: string) {
  return source.session(async (s) => {
    const week = weekToDate(today);
    const [records, previous, weekRecords, goals] = await Promise.all([
      s.activities(range, { withText: true }),
      s.activities(previousRange(range)),
      s.activities(week),
      s.goals(),
    ]);
    const goal = goals.find((g) => g.metric === 'activity_minutes_week');
    return {
      records,
      previous,
      weekMinutes: totalMinutes(weekRecords, week),
      weeklyGoalMinutes: goal ? goal.targetValue : null,
    };
  });
}

export async function goalDataFor(s: HealthDataSource, range: DateRange): Promise<GoalData> {
  const [sleep, activities, habits, checks, meals, water, body, latestWeightKg] = await Promise.all(
    [
      s.sleep(range),
      s.activities(range),
      s.habits(),
      s.checks(range),
      s.meals(range),
      s.water(range),
      s.body(range),
      s.latestWeightKg(),
    ],
  );
  return { sleep, activities, habits, checks, meals, water, body, latestWeightKg };
}

export function loadGoals(source: HealthDataSource, today: string) {
  return source.session(async (s) => {
    const [goals, habits, estimateEnabled] = await Promise.all([
      s.goals({ includeArchived: true }),
      s.habits(),
      s.calorieEstimateEnabled(),
    ]);
    // Metas medem a semana corrente (segunda → hoje) ou o dia de hoje.
    const data = await goalDataFor(s, weekToDate(today));
    const progress: GoalProgress[] = goals.map((g) => goalProgress(g, data, today));
    return { goals, habits, progress, estimateEnabled };
  });
}

export function loadReminders(source: HealthDataSource) {
  return source.session(async (s) => {
    const [reminders, prefs, habits] = await Promise.all([
      s.reminders(),
      s.reminderPrefs(),
      s.habits(),
    ]);
    return { reminders, prefs, habits };
  });
}

export function loadTimeline(source: HealthDataSource, range: DateRange) {
  return source.session(async (s) => {
    const [data, goals] = await Promise.all([goalDataFor(s, range), s.goals()]);
    return { ...data, goals };
  });
}
