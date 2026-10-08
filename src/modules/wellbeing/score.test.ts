import { eachDay } from '@/lib/dates';
import type { HabitCheckRecord, HabitRecord } from '@/modules/habits';
import type { MoodRecord } from '@/modules/mood';
import type { SleepRecord } from '@/modules/sleep';
import { computeWellbeingScore, SCORE_V1, SCORE_VERSION, type ScoreInput } from './score';

const RANGE = { from: '2026-10-01', to: '2026-10-10' };

function sleep(day: string, bed = '23:00', wake = '07:00', hours = 8): SleepRecord {
  const wakeAt = new Date(`${day}T10:00:00Z`);
  return {
    id: `s-${day}`,
    bedAt: new Date(wakeAt.getTime() - hours * 3_600_000).toISOString(),
    wakeAt: wakeAt.toISOString(),
    day,
    bedTime: bed,
    wakeTime: wake,
    quality: 4,
    awakenings: 0,
    note: null,
  };
}

function mood(day: string, m: number, e: number): MoodRecord {
  return {
    id: `m-${day}`,
    loggedAt: `${day}T12:00:00.000Z`,
    day,
    mood: m,
    energy: e,
    stress: 2,
    emotions: [],
    note: null,
  };
}

const HABIT: HabitRecord = {
  id: 'h1',
  name: 'Caminhar',
  frequency: 'daily',
  weekdays: [],
  timesPerWeek: null,
  archived: false,
  createdDay: '2026-09-01',
};

function input(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    range: RANGE,
    sleep: [],
    mood: [],
    habits: [],
    checks: [],
    loggedDays: new Set(),
    ...over,
  };
}

describe('Índice de Bem-Estar v1 (§14, LEG-D08)', () => {
  it('é versionado e os pesos nominais somam 1', () => {
    expect(SCORE_VERSION).toBe(1);
    const sum = Object.values(SCORE_V1.weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(Object.isFrozen(SCORE_V1)).toBe(true);
  });

  it('sem registros: sem valor, todos os componentes fora, com motivo', () => {
    const s = computeWellbeingScore(input());
    expect(s.value).toBeNull();
    expect(s.partial).toBe(true);
    expect(s.components.find((c) => c.id === 'activity')?.reason).toBe('not_available');
    expect(s.components.find((c) => c.id === 'habits')?.reason).toBe('no_habits');
    expect(s.components.find((c) => c.id === 'sleepRegularity')?.reason).toBe('insufficient_data');
  });

  it('com rotina regular e humor alto, renormaliza os pesos entre os incluídos', () => {
    const days = eachDay(RANGE);
    const s = computeWellbeingScore(
      input({
        sleep: days.map((d) => sleep(d)),
        mood: days.map((d) => mood(d, 5, 5)),
        habits: [HABIT],
        checks: days.map((d): HabitCheckRecord => ({ habitId: 'h1', day: d })),
        loggedDays: new Set(days),
      }),
    );
    // Todos 100 (horário idêntico, humor/energia máximos, todos os checks, registro diário).
    expect(s.value).toBe(100);
    expect(s.partial).toBe(true); // atividade sempre fora na v1
    const included = s.components.filter((c) => c.included);
    expect(included.map((c) => c.id)).toEqual([
      'sleepRegularity',
      'moodEnergy',
      'habits',
      'logging',
    ]);
    const eff = included.reduce((a, c) => a + (c.effectiveWeight ?? 0), 0);
    expect(eff).toBeCloseTo(1, 10);
    expect(included.find((c) => c.id === 'sleepRegularity')?.effectiveWeight).toBeCloseTo(
      0.25 / 0.85,
      10,
    );
  });

  it('horários irregulares baixam só a regularidade; humor médio vira 50', () => {
    const days = eachDay(RANGE);
    const times = ['22:00', '01:00', '23:30', '02:00', '21:30'];
    const s = computeWellbeingScore(
      input({
        sleep: days.map((d, i) => sleep(d, times[i % times.length], i % 2 ? '09:30' : '06:00')),
        mood: days.map((d) => mood(d, 3, 3)),
        loggedDays: new Set(days),
      }),
    );
    const reg = s.components.find((c) => c.id === 'sleepRegularity');
    expect(reg?.included).toBe(true);
    expect(reg?.value).toBeLessThan(40);
    expect(s.components.find((c) => c.id === 'moodEnergy')?.value).toBe(50);
  });

  it('menos de 3 registros de sono ou humor: componente fora (dados parciais)', () => {
    const s = computeWellbeingScore(
      input({
        sleep: [sleep('2026-10-01'), sleep('2026-10-02')],
        mood: eachDay(RANGE).map((d) => mood(d, 4, 4)),
        loggedDays: new Set(eachDay(RANGE)),
      }),
    );
    expect(s.components.find((c) => c.id === 'sleepRegularity')?.included).toBe(false);
    expect(s.value).not.toBeNull();
  });

  it('constância conta a partir do primeiro registro do período', () => {
    const s = computeWellbeingScore(
      input({
        mood: ['2026-10-08', '2026-10-09', '2026-10-10'].map((d) => mood(d, 4, 4)),
        loggedDays: new Set(['2026-10-08', '2026-10-09', '2026-10-10']),
      }),
    );
    expect(s.components.find((c) => c.id === 'logging')?.value).toBe(100);
  });

  it('é determinístico', () => {
    const days = eachDay(RANGE);
    const i = input({ sleep: days.map((d) => sleep(d)), mood: days.map((d) => mood(d, 4, 2)) });
    expect(computeWellbeingScore(i)).toEqual(computeWellbeingScore(i));
  });
});
