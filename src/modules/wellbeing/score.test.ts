import { eachDay } from '@/lib/dates';
import type { HabitCheckRecord, HabitRecord } from '@/modules/habits';
import type { SleepRecord } from '@/modules/sleep';
import { computeWellbeingScore, SCORE_V2, SCORE_VERSION, type ScoreInput } from './score';

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
    habits: [],
    checks: [],
    loggedDays: new Set(),
    ...over,
  };
}

describe('Índice de Bem-Estar v2 (§14, LEG-D08, ADR-0027)', () => {
  it('é versionado e os pesos nominais somam 1', () => {
    expect(SCORE_VERSION).toBe(2);
    const sum = Object.values(SCORE_V2.weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(Object.isFrozen(SCORE_V2)).toBe(true);
  });

  it('não tem componente de humor nem de peso', () => {
    const ids = computeWellbeingScore(input()).components.map((c) => c.id);
    expect(ids).toEqual(['sleepRegularity', 'habits', 'activity', 'logging']);
  });

  it('sem registros: sem valor, todos os componentes fora, com motivo', () => {
    const s = computeWellbeingScore(input());
    expect(s.value).toBeNull();
    expect(s.partial).toBe(true);
    expect(s.components.find((c) => c.id === 'activity')?.reason).toBe('not_available');
    expect(s.components.find((c) => c.id === 'habits')?.reason).toBe('no_habits');
    expect(s.components.find((c) => c.id === 'sleepRegularity')?.reason).toBe('insufficient_data');
  });

  it('com rotina regular, renormaliza os pesos entre os incluídos', () => {
    const days = eachDay(RANGE);
    const s = computeWellbeingScore(
      input({
        sleep: days.map((d) => sleep(d)),
        habits: [HABIT],
        checks: days.map((d): HabitCheckRecord => ({ habitId: 'h1', day: d })),
        loggedDays: new Set(days),
      }),
    );
    // Todos 100 (horário idêntico, todos os checks, registro diário).
    expect(s.value).toBe(100);
    expect(s.partial).toBe(true); // atividade fora até existir o módulo
    const included = s.components.filter((c) => c.included);
    expect(included.map((c) => c.id)).toEqual(['sleepRegularity', 'habits', 'logging']);
    const eff = included.reduce((a, c) => a + (c.effectiveWeight ?? 0), 0);
    expect(eff).toBeCloseTo(1, 10);
    expect(included.find((c) => c.id === 'sleepRegularity')?.effectiveWeight).toBeCloseTo(
      0.33 / 0.8,
      10,
    );
  });

  it('horários irregulares baixam só a regularidade', () => {
    const days = eachDay(RANGE);
    const times = ['22:00', '01:00', '23:30', '02:00', '21:30'];
    const s = computeWellbeingScore(
      input({
        sleep: days.map((d, i) => sleep(d, times[i % times.length], i % 2 ? '09:30' : '06:00')),
        loggedDays: new Set(days),
      }),
    );
    const reg = s.components.find((c) => c.id === 'sleepRegularity');
    expect(reg?.included).toBe(true);
    expect(reg?.value).toBeLessThan(40);
    expect(s.components.find((c) => c.id === 'logging')?.value).toBe(100);
  });

  it('menos de 3 registros de sono: componente fora (dados parciais)', () => {
    const s = computeWellbeingScore(
      input({
        sleep: [sleep('2026-10-01'), sleep('2026-10-02')],
        habits: [HABIT],
        checks: eachDay(RANGE).map((d): HabitCheckRecord => ({ habitId: 'h1', day: d })),
        loggedDays: new Set(eachDay(RANGE)),
      }),
    );
    expect(s.components.find((c) => c.id === 'sleepRegularity')?.included).toBe(false);
    expect(s.value).not.toBeNull();
  });

  it('constância conta a partir do primeiro registro do período', () => {
    const s = computeWellbeingScore(
      input({
        loggedDays: new Set(['2026-10-08', '2026-10-09', '2026-10-10']),
      }),
    );
    expect(s.components.find((c) => c.id === 'logging')?.value).toBe(100);
  });

  it('é determinístico', () => {
    const days = eachDay(RANGE);
    const i = input({ sleep: days.map((d) => sleep(d)), loggedDays: new Set(days) });
    expect(computeWellbeingScore(i)).toEqual(computeWellbeingScore(i));
  });
});
