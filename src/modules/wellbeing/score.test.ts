import { eachDay } from '@/lib/dates';
import type { HabitCheckRecord, HabitRecord } from '@/modules/habits';
import type { SleepRecord } from '@/modules/sleep';
import { computeWellbeingScore, SCORE_V2, SCORE_V3, SCORE_VERSION, type ScoreInput } from './score';

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
    activityDays: new Set(),
    ...over,
  };
}

describe('Índice de Bem-Estar v3 (§14, LEG-D08, ADR-0027, ADR-0050)', () => {
  it('é versionado, os pesos nominais somam 1 e são os mesmos da v2', () => {
    expect(SCORE_VERSION).toBe(3);
    const sum = Object.values(SCORE_V3.weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(SCORE_V3.weights).toEqual(SCORE_V2.weights);
    expect(Object.isFrozen(SCORE_V3)).toBe(true);
  });

  it('não tem componente de humor nem de peso', () => {
    const ids = computeWellbeingScore(input()).components.map((c) => c.id);
    expect(ids).toEqual(['sleepRegularity', 'habits', 'activity', 'logging']);
  });

  it('sem registros: sem valor, todos os componentes fora, com motivo', () => {
    const s = computeWellbeingScore(input());
    expect(s.value).toBeNull();
    expect(s.partial).toBe(true);
    expect(s.components.find((c) => c.id === 'activity')?.reason).toBe('insufficient_data');
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
    expect(s.partial).toBe(true); // sem atividade registrada
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

describe('Índice v3: atividade pela regularidade de registro (ADR-0050, LEG-M07)', () => {
  const days = eachDay(RANGE);
  const full = (activityDays: string[]) =>
    computeWellbeingScore(
      input({
        sleep: days.map((d) => sleep(d)),
        habits: [HABIT],
        checks: days.map((d): HabitCheckRecord => ({ habitId: 'h1', day: d })),
        loggedDays: new Set(days),
        activityDays: new Set(activityDays),
      }),
    );

  it('com atividade registrada, o Índice fica completo (sem "parcial")', () => {
    const s = full(days);
    expect(s.partial).toBe(false);
    expect(s.components.every((c) => c.included)).toBe(true);
    expect(s.value).toBe(100);
  });

  it('conta semanas com alguma atividade: dias de descanso não reduzem, fazer mais não aumenta', () => {
    // RANGE: 2026-10-01 (quinta) a 2026-10-10 (sábado) = 2 semanas (28/09–04/10 e 05/10–11/10).
    const twoPerWeek = full(['2026-10-01', '2026-10-03', '2026-10-06', '2026-10-08']);
    expect(twoPerWeek.components.find((c) => c.id === 'activity')?.value).toBe(100);
    expect(full(days).components.find((c) => c.id === 'activity')?.value).toBe(100);
    // Só a segunda semana com atividade: metade.
    const oneWeek = full(['2026-10-05', '2026-10-06', '2026-10-07']);
    expect(oneWeek.components.find((c) => c.id === 'activity')?.value).toBe(50);
    expect(oneWeek.components.find((c) => c.id === 'activity')?.sample).toBe(3);
  });

  it('menos de 3 dias com atividade: fora, com motivo', () => {
    const s = full(days.slice(0, 2));
    const a = s.components.find((c) => c.id === 'activity');
    expect(a?.included).toBe(false);
    expect(a?.reason).toBe('insufficient_data');
    expect(s.partial).toBe(true);
  });

  it('dias fora do período não contam', () => {
    const s = full(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']);
    expect(s.components.find((c) => c.id === 'activity')?.included).toBe(false);
  });
});
