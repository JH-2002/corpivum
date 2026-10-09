import { addDays, eachDay } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import type { BodyRecord } from '@/modules/body';
import type { HabitCheckRecord, HabitRecord } from '@/modules/habits';
import type { SleepRecord } from '@/modules/sleep';

/** Dados sintéticos para os testes da camada explicativa (nunca dados reais, CLAUDE.md regra 6). */

/** Quinta, 1º de outubro, a quarta, 7 de outubro de 2026. */
export const WEEK: DateRange = { from: '2026-10-01', to: '2026-10-07' };
export const PREV_WEEK: DateRange = { from: '2026-09-24', to: '2026-09-30' };
export const TODAY = WEEK.to;

export function sleepNight(day: string, minutes: number, bedTime = '23:00'): SleepRecord {
  const wakeAt = new Date(`${day}T10:00:00Z`);
  return {
    id: `s-${day}`,
    bedAt: new Date(wakeAt.getTime() - minutes * 60_000).toISOString(),
    wakeAt: wakeAt.toISOString(),
    day,
    bedTime,
    wakeTime: '07:00',
    quality: null,
    awakenings: null,
    note: null,
  };
}

export function sleepWeek(range: DateRange, minutes: number[]): SleepRecord[] {
  return eachDay(range).flatMap((day, i) => {
    const m = minutes[i];
    return m === undefined ? [] : [sleepNight(day, m)];
  });
}

export function habit(over: Partial<HabitRecord> = {}): HabitRecord {
  return {
    id: 'h1',
    name: 'Caminhar',
    frequency: 'daily',
    weekdays: [],
    timesPerWeek: null,
    archived: false,
    createdDay: '2026-09-01',
    ...over,
  };
}

export function checksOn(habitId: string, days: string[]): HabitCheckRecord[] {
  return days.map((day) => ({ habitId, day }));
}

export function bodyEntry(day: string, over: Partial<BodyRecord> = {}): BodyRecord {
  return {
    id: `b-${day}`,
    measuredAt: `${day}T11:00:00.000Z`,
    day,
    weightKg: null,
    heightCm: null,
    waistCm: null,
    hipCm: null,
    armCm: null,
    thighCm: null,
    chestCm: null,
    bodyFatPct: null,
    ...over,
  };
}

export const day = (offset: number) => addDays(WEEK.from, offset);
