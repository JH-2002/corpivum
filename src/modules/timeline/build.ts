import { round } from '@/lib/stats';
import type { DateRange } from '@/lib/period';
import type { ActivityRecord, ActivityType } from '@/modules/activity';
import type { BodyRecord } from '@/modules/body';
import { weeklyResults, type GoalData, type GoalMetric, type GoalRecord } from '@/modules/goals';
import { allowsMilestone } from '@/modules/guardrails';
import type { HabitCheckRecord, HabitRecord } from '@/modules/habits';
import type { MealCategory, MealRecord, WaterRecord } from '@/modules/nutrition';
import { durationMinutes, type SleepRecord } from '@/modules/sleep';

/**
 * Timeline pessoal (§31), função pura. Junta os registros por dia, do mais recente para o mais antigo,
 * na ordem sono → atividade → hábitos → corpo → alimentação, e acrescenta marcos automáticos:
 * - meta atingida numa semana (só onde `allowsMilestone` permite: nunca peso nem calorias, LEG-M06/M07);
 * - hábito novo.
 * Medidas do corpo aparecem como registro, com a mudança em número, seta e palavra (sem comemorar).
 */
export const TIMELINE_DOMAINS = [
  'sleep',
  'activity',
  'habits',
  'body',
  'nutrition',
  'goals',
] as const;
export type TimelineDomain = (typeof TIMELINE_DOMAINS)[number];

export type TimelineItem =
  | { kind: 'sleep'; id: string; time: string; durationMin: number; quality: number | null }
  | {
      kind: 'activity';
      id: string;
      time: string;
      type: ActivityType;
      durationMin: number;
      sets: number;
    }
  | { kind: 'habits'; done: number }
  | {
      kind: 'body';
      id: string;
      /** Peso desta medição e a diferença para a medição anterior com peso (kg). */
      weightKg: number | null;
      weightChangeKg: number | null;
      /** Quantas medidas além do peso foram informadas. */
      otherFields: number;
    }
  | { kind: 'meal'; id: string; time: string; category: MealCategory }
  | { kind: 'water'; ml: number }
  | {
      kind: 'milestone';
      milestone: 'goal_reached';
      metric: GoalMetric;
      value: number;
      target: number;
    }
  | { kind: 'milestone'; milestone: 'new_habit'; habitName: string };

export interface TimelineDay {
  day: string;
  items: TimelineItem[];
}

export interface TimelineInput {
  sleep: SleepRecord[];
  activities: ActivityRecord[];
  habits: HabitRecord[];
  checks: HabitCheckRecord[];
  body: BodyRecord[];
  meals: MealRecord[];
  water: WaterRecord[];
  goals: GoalRecord[];
  range: DateRange;
  today: string;
  /** Filtro de domínio; `null` = todos. */
  domain: TimelineDomain | null;
}

const ORDER: Record<TimelineItem['kind'], number> = {
  sleep: 0,
  activity: 1,
  habits: 2,
  body: 3,
  meal: 4,
  water: 5,
  milestone: 6,
};

const DOMAIN_OF: Record<TimelineItem['kind'], TimelineDomain> = {
  sleep: 'sleep',
  activity: 'activity',
  habits: 'habits',
  body: 'body',
  meal: 'nutrition',
  water: 'nutrition',
  milestone: 'goals',
};

const BODY_EXTRA = [
  'heightCm',
  'waistCm',
  'hipCm',
  'armCm',
  'thighCm',
  'chestCm',
  'bodyFatPct',
] as const;

export function buildTimeline(input: TimelineInput): TimelineDay[] {
  const { range } = input;
  const inRange = (day: string) => day >= range.from && day <= range.to;
  const byDay = new Map<string, TimelineItem[]>();
  const add = (day: string, item: TimelineItem) => {
    if (!inRange(day)) return;
    if (input.domain !== null && DOMAIN_OF[item.kind] !== input.domain) {
      // Marcos de hábito novo também aparecem no filtro de hábitos.
      const habitMilestone = item.kind === 'milestone' && item.milestone === 'new_habit';
      if (!(habitMilestone && input.domain === 'habits')) return;
    }
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  };

  for (const r of input.sleep) {
    add(r.day, {
      kind: 'sleep',
      id: r.id,
      time: r.wakeTime,
      durationMin: durationMinutes(r),
      quality: r.quality,
    });
  }
  for (const r of input.activities) {
    add(r.day, {
      kind: 'activity',
      id: r.id,
      time: r.time,
      type: r.type,
      durationMin: r.durationMin,
      sets: r.sets.length,
    });
  }
  const checksByDay = new Map<string, number>();
  for (const c of input.checks) checksByDay.set(c.day, (checksByDay.get(c.day) ?? 0) + 1);
  for (const [day, done] of checksByDay) add(day, { kind: 'habits', done });

  let lastWeight: number | null = null;
  for (const r of [...input.body].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))) {
    const change =
      r.weightKg !== null && lastWeight !== null ? round(r.weightKg - lastWeight, 1) : null;
    if (r.weightKg !== null) lastWeight = r.weightKg;
    add(r.day, {
      kind: 'body',
      id: r.id,
      weightKg: r.weightKg,
      weightChangeKg: change,
      otherFields: BODY_EXTRA.filter((f) => r[f] !== null).length,
    });
  }
  for (const r of input.meals) {
    add(r.day, { kind: 'meal', id: r.id, time: r.time, category: r.category });
  }
  const waterByDay = new Map<string, number>();
  for (const w of input.water) waterByDay.set(w.day, (waterByDay.get(w.day) ?? 0) + w.ml);
  for (const [day, ml] of waterByDay) add(day, { kind: 'water', ml });

  for (const h of input.habits) {
    add(h.createdDay, { kind: 'milestone', milestone: 'new_habit', habitName: h.name });
  }
  const goalData: GoalData = {
    sleep: input.sleep,
    activities: input.activities,
    habits: input.habits,
    checks: input.checks,
    meals: input.meals,
    water: input.water,
    body: input.body,
    latestWeightKg: null,
  };
  for (const g of input.goals) {
    if (!allowsMilestone(g.domain)) continue;
    for (const w of weeklyResults(g, goalData, range, input.today)) {
      if (w.reached && w.value !== null) {
        add(w.weekEnd, {
          kind: 'milestone',
          milestone: 'goal_reached',
          metric: g.metric,
          value: w.value,
          target: g.targetValue,
        });
      }
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, items]) => ({
      day,
      items: items
        .map((item, i) => ({ item, i }))
        .sort(
          (a, b) =>
            ORDER[a.item.kind] - ORDER[b.item.kind] ||
            ('time' in a.item && 'time' in b.item ? a.item.time.localeCompare(b.item.time) : 0) ||
            a.i - b.i,
        )
        .map((x) => x.item),
    }));
}

/** Filtro de domínio vindo da URL (`?dominio=`); valor desconhecido = todos. */
export function parseTimelineDomain(raw: string | string[] | undefined): TimelineDomain | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (TIMELINE_DOMAINS as readonly string[]).includes(v ?? '') ? (v as TimelineDomain) : null;
}
