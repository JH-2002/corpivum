import type { ActivityRecord } from '@/modules/activity';
import type { GoalProgress, GoalRecord } from '@/modules/goals';
import type { MealRecord } from '@/modules/nutrition';
import { activityInsights } from './activity';
import { goalsInsights } from './goals';
import { nutritionInsights } from './nutrition';

const TODAY = '2026-10-07';
const WEEK = { from: '2026-10-01', to: TODAY };
const day = (n: number) => `2026-10-0${n + 1}`;

const meal = (d: string, over: Partial<MealRecord> = {}): MealRecord => ({
  id: `m-${d}`,
  eatenAt: `${d}T15:00:00.000Z`,
  day: d,
  time: '12:00',
  category: 'lunch',
  description: null,
  hunger: null,
  fullness: null,
  satisfaction: 4,
  kcalEstimate: 900,
  note: null,
  ...over,
});

const act = (d: string, durationMin = 30, over: Partial<ActivityRecord> = {}): ActivityRecord => ({
  id: `a-${d}-${durationMin}`,
  startedAt: `${d}T10:00:00.000Z`,
  day: d,
  time: '07:00',
  type: 'walking',
  durationMin,
  intensity: null,
  distanceKm: null,
  note: null,
  sets: [],
  ...over,
});

const keys = (i: { sentences: Array<{ key: string }> }) => i.sentences.map((s) => s.key);

describe('resumo de alimentação (LEG-M07)', () => {
  it('descreve registro, água e satisfação; nunca calorias', () => {
    const r = nutritionInsights({
      meals: [0, 1, 2, 3].map((n) => meal(day(n))),
      water: [{ id: 'w', day: day(0), ml: 1500 }],
      previousMeals: [meal('2026-09-25'), meal('2026-09-26'), meal('2026-09-27')],
      range: WEEK,
      today: TODAY,
    });
    expect(r.state).toBe('ok');
    expect(keys(r)).toEqual(['logged', 'compareMore', 'water', 'satisfaction']);
    expect(JSON.stringify(r)).not.toMatch(/kcal|calor/i);
  });

  it('parcial e vazio', () => {
    expect(
      nutritionInsights({
        meals: [meal(day(0))],
        water: [],
        previousMeals: [],
        range: WEEK,
        today: TODAY,
      }).state,
    ).toBe('partial');
    expect(
      nutritionInsights({ meals: [], water: [], previousMeals: [], range: WEEK, today: TODAY })
        .state,
    ).toBe('empty');
  });
});

describe('resumo de atividade (LEG-M08)', () => {
  it('total, comparação com a própria meta, tipo e progressão em contagem (sem nome)', () => {
    const strength = (d: string, load: number) =>
      act(d, 40, {
        type: 'strength',
        sets: [{ exercise: 'Nome-que-nao-pode-vazar', setIndex: 1, reps: 10, loadKg: load }],
      });
    const r = activityInsights({
      records: [act(day(0)), act(day(1)), strength(day(2), 20), strength(day(4), 22.5)],
      previous: [],
      range: WEEK,
      today: TODAY,
      weeklyGoal: { current: 90, target: 150 },
    });
    expect(keys(r)).toEqual(['total', 'goal', 'topType', 'progression']);
    expect(r.sentences.find((s) => s.key === 'progression')?.args.up).toEqual({
      kind: 'int',
      value: 1,
    });
    expect(JSON.stringify(r)).not.toContain('Nome-que-nao-pode-vazar');
    expect(JSON.stringify(r)).not.toMatch(/kcal|calor/i);
  });

  it('sem meta: compara com o período anterior', () => {
    const r = activityInsights({
      records: [act(day(0), 60), act(day(1), 60), act(day(2), 60)],
      previous: [act('2026-09-25', 30), act('2026-09-26', 30), act('2026-09-27', 30)],
      range: WEEK,
      today: TODAY,
    });
    expect(keys(r)).toContain('compareMore');
  });
});

describe('resumo de metas (LEG-M06)', () => {
  const g = (over: Partial<GoalRecord>): GoalRecord => ({
    id: 'g',
    domain: 'activity',
    metric: 'activity_minutes_week',
    targetValue: 100,
    startValue: null,
    habitId: null,
    targetDay: null,
    status: 'active',
    createdDay: '2026-09-01',
    ...over,
  });
  const p = (goalId: string, reached: boolean, deadlinePassed = false): GoalProgress => ({
    goalId,
    window: 'week',
    current: 1,
    target: 1,
    ratio: reached ? 1 : 0.5,
    reached,
    deadlinePassed,
    weightChangeKg: null,
  });

  it('meta de peso alcançada não entra na contagem de alcançadas', () => {
    const r = goalsInsights({
      goals: [g({ id: 'a' }), g({ id: 'w', domain: 'weight', metric: 'weight_kg' })],
      progress: [p('a', false), p('w', true)],
    });
    expect(r.sentences[1]).toEqual({
      key: 'reached',
      args: { reached: { kind: 'int', value: 0 }, total: { kind: 'int', value: 1 } },
    });
  });

  it('prazo encerrado aparece sem juízo; sem metas = vazio', () => {
    const r = goalsInsights({ goals: [g({ id: 'a' })], progress: [p('a', false, true)] });
    expect(keys(r)).toEqual(['active', 'reached', 'ended']);
    expect(goalsInsights({ goals: [], progress: [] }).state).toBe('empty');
  });
});
