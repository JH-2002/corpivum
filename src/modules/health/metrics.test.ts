import { bmi, change, latest, type BodyRecord } from '@/modules/body';
import {
  completionRate,
  currentStreak,
  expectedOccurrences,
  habitInputSchema,
  type HabitRecord,
} from '@/modules/habits';
import { journalFilterSchema } from '@/modules/journal';
import { moodInputSchema } from '@/modules/mood';
import { centeredMinutes, scheduleSpreadMinutes, sleepInputSchema } from '@/modules/sleep';
import { bodyInputSchema } from '@/modules/body';
import { sanitizePeriod, validateCustomRange } from '@/lib/period';

const habit = (over: Partial<HabitRecord> = {}): HabitRecord => ({
  id: 'h',
  name: 'Ler',
  frequency: 'daily',
  weekdays: [],
  timesPerWeek: null,
  archived: false,
  createdDay: '2026-09-01',
  ...over,
});

describe('sono (§20)', () => {
  it('centraliza o horário de deitar na meia-noite', () => {
    expect(centeredMinutes('23:00')).toBe(-60);
    expect(centeredMinutes('01:30')).toBe(90);
  });

  it('variação de horário: zero quando sempre igual; precisa de 2 noites', () => {
    const same = { bedTime: '23:00', wakeTime: '07:00' };
    expect(scheduleSpreadMinutes([same, same, same])).toBe(0);
    expect(scheduleSpreadMinutes([same])).toBeNull();
    // 23:30 e 00:30 ficam a 60 min, não 23 h.
    expect(
      scheduleSpreadMinutes([
        { bedTime: '23:30', wakeTime: '07:00' },
        { bedTime: '00:30', wakeTime: '07:00' },
      ]),
    ).toBe(15);
  });

  it('formulário: acordar depois de deitar; nota opcional com limite', () => {
    expect(
      sleepInputSchema.safeParse({ bedAt: '2026-10-01T23:00', wakeAt: '2026-10-01T22:00' }).success,
    ).toBe(false);
    const ok = sleepInputSchema.parse({
      bedAt: '2026-10-01T23:00',
      wakeAt: '2026-10-02T07:00',
      quality: '',
      note: '  ',
    });
    expect(ok.quality).toBeUndefined();
    expect(ok.note).toBeUndefined();
    expect(
      sleepInputSchema.safeParse({
        bedAt: '2026-10-01T23:00',
        wakeAt: '2026-10-02T07:00',
        quality: '6',
      }).success,
    ).toBe(false);
  });
});

describe('humor (§21)', () => {
  it('escalas 1–5 obrigatórias e emoções de lista fechada, sem repetição', () => {
    const base = { loggedAt: '2026-10-01T10:00', mood: '3', energy: '3', stress: '3' };
    expect(moodInputSchema.parse({ ...base, emotions: ['calm', 'calm'] }).emotions).toEqual([
      'calm',
    ]);
    expect(moodInputSchema.safeParse({ ...base, emotions: ['ansiedade'] }).success).toBe(false);
    expect(moodInputSchema.safeParse({ ...base, mood: '', emotions: [] }).success).toBe(false);
  });
});

describe('hábitos (§22, LEG-F05)', () => {
  it('ocorrências esperadas por frequência', () => {
    const range = { from: '2026-10-05', to: '2026-10-11' }; // segunda a domingo
    expect(expectedOccurrences(habit(), range)).toBe(7);
    expect(expectedOccurrences(habit({ frequency: 'weekdays', weekdays: [1, 3, 5] }), range)).toBe(
      3,
    );
    expect(
      expectedOccurrences(habit({ frequency: 'times_per_week', timesPerWeek: 2 }), range),
    ).toBe(2);
    expect(expectedOccurrences(habit({ createdDay: '2026-10-10' }), range)).toBe(2);
  });

  it('cumprimento limitado a 100% e só de hábitos ativos', () => {
    const range = { from: '2026-10-05', to: '2026-10-06' };
    const checks = [
      { habitId: 'h', day: '2026-10-05' },
      { habitId: 'h', day: '2026-10-06' },
      { habitId: 'x', day: '2026-10-06' },
    ];
    expect(completionRate([habit()], checks, range)).toBe(1);
    expect(completionRate([habit({ archived: true })], checks, range)).toBeNull();
  });

  it('sequência: hoje sem check não quebra; dia previsto perdido quebra', () => {
    const checks = ['2026-10-04', '2026-10-05', '2026-10-06'].map((day) => ({ habitId: 'h', day }));
    expect(currentStreak(habit(), checks, '2026-10-07')).toBe(3);
    expect(currentStreak(habit(), checks.slice(1), '2026-10-07')).toBe(2);
    expect(currentStreak(habit(), [{ habitId: 'h', day: '2026-10-05' }], '2026-10-07')).toBe(0);
  });

  it('formulário normaliza a frequência', () => {
    expect(
      habitInputSchema.parse({
        name: ' Ler ',
        frequency: 'daily',
        weekdays: ['1'],
        timesPerWeek: '3',
      }),
    ).toEqual({
      name: 'Ler',
      frequency: 'daily',
      weekdays: [],
      timesPerWeek: null,
    });
    expect(
      habitInputSchema.safeParse({ name: 'Ler', frequency: 'weekdays', weekdays: [] }).success,
    ).toBe(false);
  });
});

describe('diário (§19)', () => {
  it('filtros só por humor e etiqueta; valores inválidos são ignorados', () => {
    expect(journalFilterSchema.parse({ mood: '4', tag: 'work' })).toEqual({ mood: 4, tag: 'work' });
    expect(journalFilterSchema.parse({ tag: 'qualquer coisa' })).toEqual({ tag: undefined });
  });
});

describe('corpo (§23, LEG-M04)', () => {
  const rec = (
    day: string,
    weightKg: number | null,
    heightCm: number | null = null,
  ): BodyRecord => ({
    id: day,
    measuredAt: `${day}T10:00:00.000Z`,
    day,
    weightKg,
    heightCm,
    waistCm: null,
    hipCm: null,
    armCm: null,
    thighCm: null,
    chestCm: null,
    bodyFatPct: null,
  });

  it('IMC estimado, último valor e variação', () => {
    expect(bmi(70.5, 172)).toBe(23.8);
    expect(bmi(null, 172)).toBeNull();
    const list = [rec('2026-10-01', 72, 172), rec('2026-10-05', null), rec('2026-10-06', 71.2)];
    expect(latest(list, 'weightKg')).toEqual({ value: 71.2, day: '2026-10-06' });
    expect(change(list, 'weightKg')).toBe(-0.8);
  });

  it('formulário aceita vírgula e exige ao menos uma medida, dentro das faixas', () => {
    expect(
      bodyInputSchema.parse({ measuredAt: '2026-10-01T08:00', weightKg: '70,5' }).weightKg,
    ).toBe(70.5);
    expect(bodyInputSchema.safeParse({ measuredAt: '2026-10-01T08:00' }).success).toBe(false);
    expect(
      bodyInputSchema.safeParse({ measuredAt: '2026-10-01T08:00', weightKg: '10' }).success,
    ).toBe(false);
  });
});

describe('período global no cookie (ADR-0021)', () => {
  it('valor inválido, futuro ou longo demais vira o padrão', () => {
    const today = '2026-10-07';
    expect(sanitizePeriod('{"preset":"7d"}', today)).toEqual({ preset: '7d' });
    expect(sanitizePeriod('lixo', today)).toEqual({ preset: '30d' });
    expect(
      sanitizePeriod('{"preset":"custom","from":"2026-10-01","to":"2026-10-09"}', today),
    ).toEqual({ preset: '30d' });
    expect(
      sanitizePeriod('{"preset":"custom","from":"2024-01-01","to":"2026-10-01"}', today),
    ).toEqual({ preset: '30d' });
    expect(validateCustomRange('2025-10-07', '2026-10-07', today)).toBeNull();
    expect(validateCustomRange('2025-10-06', '2026-10-07', today)).toBe('too_long');
  });
});

describe('data e hora local (formulários)', () => {
  it('recusa datas e horas impossíveis', async () => {
    const { localDateTimeSchema } = await import('./zod');
    expect(localDateTimeSchema.safeParse('2026-10-01T23:59').success).toBe(true);
    expect(localDateTimeSchema.safeParse('2026-02-31T10:00').success).toBe(false);
    expect(localDateTimeSchema.safeParse('2026-10-01T25:70').success).toBe(false);
  });
});
