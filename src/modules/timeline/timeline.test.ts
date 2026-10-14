import type { GoalRecord } from '@/modules/goals';
import { buildTimeline, parseTimelineDomain, type TimelineInput } from './build';

const TODAY = '2026-10-07';
const range = { from: '2026-09-21', to: TODAY };

const goal = (over: Partial<GoalRecord>): GoalRecord => ({
  id: 'g',
  domain: 'activity',
  metric: 'activity_minutes_week',
  targetValue: 30,
  startValue: null,
  habitId: null,
  targetDay: null,
  status: 'active',
  createdDay: '2026-09-01',
  ...over,
});

const base: TimelineInput = {
  sleep: [
    {
      id: 's1',
      bedAt: '2026-10-06T02:00:00.000Z',
      wakeAt: '2026-10-06T10:00:00.000Z',
      day: '2026-10-06',
      bedTime: '23:00',
      wakeTime: '07:00',
      quality: 4,
      awakenings: null,
      note: null,
    },
  ],
  activities: [
    {
      id: 'a1',
      startedAt: '2026-10-06T21:00:00.000Z',
      day: '2026-10-06',
      time: '18:00',
      type: 'walking',
      durationMin: 40,
      intensity: null,
      distanceKm: null,
      note: null,
      sets: [],
    },
    {
      id: 'a0',
      startedAt: '2026-09-23T21:00:00.000Z',
      day: '2026-09-23',
      time: '18:00',
      type: 'walking',
      durationMin: 40,
      intensity: null,
      distanceKm: null,
      note: null,
      sets: [],
    },
  ],
  habits: [
    {
      id: 'h1',
      name: 'Caminhar',
      frequency: 'daily',
      weekdays: [],
      timesPerWeek: null,
      archived: false,
      createdDay: '2026-10-01',
    },
  ],
  checks: [{ habitId: 'h1', day: '2026-10-06' }],
  body: [
    {
      id: 'b1',
      measuredAt: '2026-09-28T10:00:00.000Z',
      day: '2026-09-28',
      weightKg: 70,
      heightCm: null,
      waistCm: null,
      hipCm: null,
      armCm: null,
      thighCm: null,
      chestCm: null,
      bodyFatPct: null,
    },
    {
      id: 'b2',
      measuredAt: '2026-10-05T10:00:00.000Z',
      day: '2026-10-05',
      weightKg: 69.5,
      heightCm: null,
      waistCm: 80,
      hipCm: null,
      armCm: null,
      thighCm: null,
      chestCm: null,
      bodyFatPct: null,
    },
  ],
  meals: [
    {
      id: 'm1',
      eatenAt: '2026-10-06T15:00:00.000Z',
      day: '2026-10-06',
      time: '12:00',
      category: 'lunch',
      description: null,
      hunger: null,
      fullness: null,
      satisfaction: null,
      kcalEstimate: 2000,
      note: null,
    },
  ],
  water: [{ id: 'w1', day: '2026-10-06', ml: 300 }],
  goals: [],
  range,
  today: TODAY,
  domain: null,
};

describe('timeline (§31)', () => {
  it('agrupa por dia, do mais recente, na ordem sono → atividade → hábitos → corpo → alimentação', () => {
    const days = buildTimeline(base);
    expect(days.map((d) => d.day)).toEqual([
      '2026-10-06',
      '2026-10-05',
      '2026-10-01',
      '2026-09-28',
      '2026-09-23',
    ]);
    expect(days[0]?.items.map((i) => i.kind)).toEqual([
      'sleep',
      'activity',
      'habits',
      'meal',
      'water',
    ]);
  });

  it('medida do corpo mostra a mudança em número em relação à anterior, sem virar marco', () => {
    const day = buildTimeline(base).find((d) => d.day === '2026-10-05');
    expect(day?.items).toEqual([
      { kind: 'body', id: 'b2', weightKg: 69.5, weightChangeKg: -0.5, otherFields: 1 },
    ]);
  });

  it('marcos: hábito novo e meta semanal atingida; nunca peso nem calorias (LEG-M06, LEG-M07)', () => {
    const days = buildTimeline({
      ...base,
      goals: [
        goal({}),
        goal({ id: 'w', domain: 'weight', metric: 'weight_kg', targetValue: 69.5, startValue: 70 }),
        goal({ id: 'k', domain: 'nutrition', metric: 'kcal_reference_day', targetValue: 1500 }),
      ],
    });
    const milestones = days.flatMap((d) =>
      d.items.filter((i) => i.kind === 'milestone').map((i) => ({ day: d.day, ...i })),
    );
    expect(milestones).toEqual([
      { day: '2026-10-01', kind: 'milestone', milestone: 'new_habit', habitName: 'Caminhar' },
      {
        day: '2026-09-27',
        kind: 'milestone',
        milestone: 'goal_reached',
        metric: 'activity_minutes_week',
        value: 40,
        target: 30,
      },
    ]);
  });

  it('filtra por domínio; valor desconhecido na URL = tudo', () => {
    const only = buildTimeline({ ...base, domain: 'nutrition' });
    expect(only.flatMap((d) => d.items.map((i) => i.kind))).toEqual(['meal', 'water']);
    const habits = buildTimeline({ ...base, domain: 'habits' });
    expect(habits.flatMap((d) => d.items.map((i) => i.kind))).toEqual(['habits', 'milestone']);
    expect(parseTimelineDomain('body')).toBe('body');
    expect(parseTimelineDomain('<script>')).toBeNull();
    expect(parseTimelineDomain(undefined)).toBeNull();
  });
});
