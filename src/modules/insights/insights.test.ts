import { eachDay } from '@/lib/dates';
import { bodyInsights } from './body';
import { dashboardInsights, type PeriodRecords } from './dashboard';
import {
  bodyEntry,
  checksOn,
  day,
  habit,
  journalOn,
  PREV_WEEK,
  sleepNight,
  sleepWeek,
  TODAY,
  WEEK,
} from './fixtures';
import { habitsInsights } from './habits';
import { journalInsights } from './journal';
import { extremeDays, INSIGHT_RULES, periodArgs } from './rules';
import { sleepInsights } from './sleep';
import type { ModuleInsights } from './types';

const keys = (i: ModuleInsights) => i.sentences.map((s) => s.key);

/** Nunca mais de 4 frases; 2 a 4 com amostra suficiente. */
function expectSentenceBounds(i: ModuleInsights) {
  expect(i.sentences.length).toBeLessThanOrEqual(INSIGHT_RULES.maxSentences);
  if (i.state === 'ok') expect(i.sentences.length).toBeGreaterThanOrEqual(2);
}

describe('regras comuns (ADR-0025)', () => {
  it('período recente termina hoje; senão é um período escolhido', () => {
    expect(periodArgs(WEEK, TODAY)).toEqual({
      recent: { kind: 'select', value: 'yes' },
      days: { kind: 'int', value: 7 },
    });
    expect(periodArgs(WEEK, '2026-10-20').recent).toEqual({ kind: 'select', value: 'no' });
  });

  it('dias extremos: ignoram dias sem valor e desempatam pela ordem do calendário', () => {
    const rows = [
      { day: '2026-10-02', value: 5 },
      { day: '2026-10-01', value: 5 },
      { day: '2026-10-03', value: null },
      { day: '2026-10-04', value: 9 },
    ];
    expect(extremeDays(rows, 'min', 1)).toEqual(['2026-10-01']);
    expect(extremeDays(rows, 'min', 2)).toEqual(['2026-10-01', '2026-10-02']);
    expect(extremeDays(rows, 'max', 1)).toEqual(['2026-10-04']);
    expect(extremeDays([], 'max', 1)).toEqual([]);
  });
});

describe('resumo de sono', () => {
  // Qui 420, Sex 420, Sáb 450, Dom 430, Seg 400, Ter 340, Qua 340 → média 400 min (6 h 40 min).
  const week = sleepWeek(WEEK, [420, 420, 450, 430, 400, 340, 340]);
  const previous = sleepWeek(PREV_WEEK, [420, 420, 420, 420, 420, 420, 420]);

  it('dados completos: média, comparação, noites extremas e horários', () => {
    const i = sleepInsights({ records: week, previous, range: WEEK, today: TODAY });
    expect(i.state).toBe('ok');
    expect(keys(i)).toEqual(['average', 'compareLess', 'extremes', 'spreadSteady']);
    expect(i.sentences[0]?.args.avg).toEqual({ kind: 'duration', value: 400 });
    expect(i.sentences[1]?.args.diff).toEqual({ kind: 'duration', value: 20 });
    expect(i.sentences[2]?.args).toMatchObject({
      shortest: { kind: 'days', value: ['2026-10-06', '2026-10-07'], style: 'weekday' },
      longest: { kind: 'days', value: ['2026-10-03'] },
    });
    expect(i.highlights.map((h) => h.key)).toEqual(['longest', 'shortest', 'change']);
    expect(i.supportSignal).toBe(false);
    expectSentenceBounds(i);
  });

  it('limiar exato: 19 min é "parecido", 20 min já é diferença', () => {
    const prev19 = sleepWeek(PREV_WEEK, Array(7).fill(419));
    const prev20 = sleepWeek(PREV_WEEK, Array(7).fill(420));
    const at = (prev: typeof prev19) =>
      sleepInsights({
        records: sleepWeek(WEEK, Array(7).fill(400)),
        previous: prev,
        range: WEEK,
        today: TODAY,
      });
    expect(keys(at(prev19))).toContain('compareSame');
    expect(keys(at(prev20))).toContain('compareLess');
  });

  it('sem período anterior suficiente: não compara', () => {
    const i = sleepInsights({
      records: week,
      previous: previous.slice(0, 2),
      range: WEEK,
      today: TODAY,
    });
    expect(keys(i)).not.toContain('compareLess');
    expect(i.highlights.map((h) => h.key)).not.toContain('change');
  });

  it('horários que variam: frase com a variação', () => {
    const records = [
      sleepNight(day(0), 420, '22:00'),
      sleepNight(day(1), 420, '23:30'),
      sleepNight(day(2), 420, '01:00'),
    ];
    expect(keys(sleepInsights({ records, previous: [], range: WEEK, today: TODAY }))).toContain(
      'spread',
    );
  });

  it('dados parciais: só a média, com aviso', () => {
    const i = sleepInsights({ records: week.slice(0, 2), previous, range: WEEK, today: TODAY });
    expect(i.state).toBe('partial');
    expect(keys(i)).toEqual(['average', 'partial']);
    expect(i.highlights).toEqual([]);
  });

  it('vazio', () => {
    const i = sleepInsights({ records: [], previous, range: WEEK, today: TODAY });
    expect(i.state).toBe('empty');
    expect(keys(i)).toEqual(['empty']);
  });

  it('período longo usa datas, não dias da semana', () => {
    const range = { from: '2026-09-08', to: '2026-10-07' };
    const records = eachDay(range).map((d, n) => sleepNight(d, 400 + (n % 5) * 10));
    const i = sleepInsights({ records, previous: [], range, today: TODAY });
    const extremes = i.sentences.find((s) => s.key === 'extremes');
    expect(extremes?.args.shortest).toMatchObject({ style: 'date' });
  });
});

describe('resumo de hábitos (LEG-F05)', () => {
  const daily = habit();
  const weekly = habit({ id: 'h2', frequency: 'times_per_week', timesPerWeek: 3 });
  const base = {
    habits: [daily],
    range: WEEK,
    previousRange: PREV_WEEK,
    today: TODAY,
    streaksEnabled: true,
  };

  it('dados completos: cumprimento pela frequência prevista, comparação, dia e sequência', () => {
    const i = habitsInsights({
      ...base,
      checks: checksOn('h1', [day(0), day(1), day(2), day(3), day(5)]),
      previousChecks: checksOn('h1', [PREV_WEEK.from, PREV_WEEK.to]),
    });
    expect(i.state).toBe('ok');
    expect(keys(i)).toEqual(['completion', 'compareMore', 'busiest', 'streak']);
    expect(i.sentences[0]?.args).toMatchObject({
      done: { value: 5 },
      expected: { value: 7 },
      percent: { value: 71 },
    });
    expect(i.sentences[3]?.args).toMatchObject({ count: { value: 4 }, unit: { value: 'days' } });
    expectSentenceBounds(i);
  });

  it('sequências desativadas: nenhuma frase nem destaque de sequência', () => {
    const i = habitsInsights({
      ...base,
      streaksEnabled: false,
      checks: checksOn('h1', eachDay(WEEK)),
      previousChecks: [],
    });
    expect(keys(i)).not.toContain('streak');
    expect(i.highlights.map((h) => h.key)).not.toContain('streak');
  });

  it('hábito semanal conta semanas com a meta atingida', () => {
    const range = { from: '2026-09-17', to: '2026-10-07' };
    const checks = checksOn('h2', [
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    const i = habitsInsights({
      ...base,
      habits: [weekly],
      range,
      previousRange: { from: '2026-08-27', to: '2026-09-16' },
      checks,
      previousChecks: [],
    });
    const streak = i.sentences.find((s) => s.key === 'streak');
    expect(streak?.args).toMatchObject({ count: { value: 3 }, unit: { value: 'weeks' } });
  });

  it('dados parciais: poucas marcações previstas', () => {
    const i = habitsInsights({
      ...base,
      habits: [habit({ createdDay: day(5) })],
      checks: checksOn('h1', [day(5)]),
      previousChecks: [],
    });
    expect(i.state).toBe('partial');
    expect(keys(i)).toEqual(['completion', 'partial']);
  });

  it('vazio: sem hábito ativo', () => {
    const i = habitsInsights({
      ...base,
      habits: [habit({ archived: true })],
      checks: [],
      previousChecks: [],
    });
    expect(i.state).toBe('empty');
  });
});

describe('resumo do diário (só metadados)', () => {
  it('dados completos: contagem, comparação, etiqueta e intervalo', () => {
    const i = journalInsights({
      entries: [...journalOn([day(0), day(1)], ['work']), ...journalOn([day(5)], ['work', 'rest'])],
      previous: journalOn([PREV_WEEK.from]),
      range: WEEK,
      today: TODAY,
    });
    expect(i.state).toBe('ok');
    expect(keys(i)).toEqual(['count', 'compare', 'topTag', 'gap']);
    expect(i.sentences[2]?.args.tag).toEqual({ kind: 'tag', value: 'work' });
    expect(i.sentences[3]?.args.gap).toEqual({ kind: 'int', value: 4 });
    expectSentenceBounds(i);
  });

  it('entradas seguidas: fala da mais recente em vez do intervalo', () => {
    const i = journalInsights({
      entries: journalOn([day(4), day(5), day(6)]),
      previous: [],
      range: WEEK,
      today: TODAY,
    });
    expect(keys(i)).toEqual(['count', 'compare', 'latest']);
  });

  it('parcial e vazio', () => {
    expect(
      journalInsights({ entries: journalOn([day(1)]), previous: [], range: WEEK, today: TODAY })
        .state,
    ).toBe('partial');
    expect(journalInsights({ entries: [], previous: [], range: WEEK, today: TODAY }).state).toBe(
      'empty',
    );
  });
});

describe('resumo de corpo (LEG-M04)', () => {
  it('dados completos: último peso, variação, medida que mais variou; sem IMC', () => {
    const i = bodyInsights({
      records: [
        bodyEntry(day(0), { weightKg: 70, waistCm: 80, hipCm: 95 }),
        bodyEntry(day(6), { weightKg: 71.2, waistCm: 79, hipCm: 95.5 }),
      ],
      range: WEEK,
      today: TODAY,
    });
    expect(i.state).toBe('ok');
    expect(keys(i)).toEqual(['latestWeight', 'weightChange', 'girthChange', 'countTail']);
    expect(i.sentences[1]?.args.kg).toEqual({ kind: 'signed', value: 1.2 });
    expect(i.sentences[2]?.args).toMatchObject({ field: { value: 'waistCm' }, cm: { value: -1 } });
    expect(JSON.stringify(i)).not.toMatch(/bmi|imc/i);
  });

  it('variação menor que 0,5 kg: "variou menos de 0,5 kg"', () => {
    const i = bodyInsights({
      records: [bodyEntry(day(0), { weightKg: 70 }), bodyEntry(day(3), { weightKg: 70.4 })],
      range: WEEK,
      today: TODAY,
    });
    expect(keys(i)).toContain('weightStable');
  });

  it('parcial (uma medição) e vazio', () => {
    const one = bodyInsights({
      records: [bodyEntry(day(0), { waistCm: 80 })],
      range: WEEK,
      today: TODAY,
    });
    expect(one.state).toBe('partial');
    expect(keys(one)).toEqual(['count', 'partial']);
    expect(bodyInsights({ records: [], range: WEEK, today: TODAY }).state).toBe('empty');
  });
});

describe('resumo do dashboard', () => {
  const period = (
    over: Partial<PeriodRecords> & { range: PeriodRecords['range'] },
  ): PeriodRecords => ({
    sleep: [],
    habits: [],
    checks: [],
    loggedDays: new Set(),
    ...over,
  });
  const days = new Set(eachDay(WEEK));

  it('dados completos: constância, maiores mudanças e hábitos pela frequência prevista', () => {
    const now = period({
      range: WEEK,
      sleep: sleepWeek(WEEK, Array(7).fill(480)),
      habits: [habit()],
      checks: checksOn('h1', eachDay(WEEK).slice(0, 5)),
      loggedDays: days,
    });
    const before = period({
      range: PREV_WEEK,
      sleep: sleepWeek(PREV_WEEK, Array(7).fill(420)),
      habits: [habit()],
      checks: checksOn('h1', eachDay(PREV_WEEK).slice(0, 5)),
    });
    const i = dashboardInsights(now, before, TODAY);
    expect(i.state).toBe('ok');
    expect(keys(i)).toEqual(['coverage', 'sleepUp', 'habits']);
    expect(i.highlights[0]?.key).toBe('largest.sleep');
    expect(i.supportSignal).toBe(false);
    expectSentenceBounds(i);
  });

  it('sem mudança relevante: diz que ficou parecido', () => {
    const now = period({
      range: WEEK,
      sleep: sleepWeek(WEEK, Array(7).fill(420)),
      loggedDays: days,
    });
    const before = period({ range: PREV_WEEK, sleep: sleepWeek(PREV_WEEK, Array(7).fill(430)) });
    expect(keys(dashboardInsights(now, before, TODAY))).toEqual(['coverage', 'steady']);
  });

  it('parcial e vazio', () => {
    const before = period({ range: PREV_WEEK });
    expect(
      dashboardInsights(period({ range: WEEK, loggedDays: new Set([day(0)]) }), before, TODAY)
        .state,
    ).toBe('partial');
    expect(dashboardInsights(period({ range: WEEK }), before, TODAY).state).toBe('empty');
  });
});
