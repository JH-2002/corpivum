import { weightGoalSuspension } from './guard';
import { goalInputSchema } from './schemas';
import { goalProgress, loggedDays, weeklyResults, type GoalData } from './progress';
import type { GoalRecord } from './types';

// 2026-10-07 é quarta-feira: a semana corrente vai de 05/10 (segunda) a hoje.
const TODAY = '2026-10-07';

const empty: GoalData = {
  sleep: [],
  activities: [],
  habits: [],
  checks: [],
  meals: [],
  water: [],
  body: [],
  latestWeightKg: null,
};

const goal = (over: Partial<GoalRecord>): GoalRecord => ({
  id: 'g',
  domain: 'activity',
  metric: 'activity_minutes_week',
  targetValue: 150,
  startValue: null,
  habitId: null,
  targetDay: null,
  status: 'active',
  createdDay: '2026-09-01',
  ...over,
});

const activity = (day: string, durationMin: number) => ({
  id: `a-${day}`,
  startedAt: `${day}T10:00:00.000Z`,
  day,
  time: '07:00',
  type: 'walking' as const,
  durationMin,
  intensity: null,
  distanceKm: null,
  note: null,
  sets: [],
});

describe('progresso de metas (§30)', () => {
  it('meta semanal mede a semana corrente, com barra limitada a 100%', () => {
    const data = {
      ...empty,
      activities: [
        activity('2026-10-04', 200),
        activity('2026-10-05', 60),
        activity('2026-10-06', 30),
      ],
    };
    const p = goalProgress(goal({}), data, TODAY);
    expect(p).toMatchObject({ window: 'week', current: 90, ratio: 0.6, reached: false });
    const done = goalProgress(goal({ targetValue: 60 }), data, TODAY);
    expect(done).toMatchObject({ ratio: 1, reached: true });
  });

  it('peso: progresso do ponto de partida até o alvo, com a mudança em número (LEG-M06)', () => {
    const g = goal({ domain: 'weight', metric: 'weight_kg', targetValue: 76, startValue: 80 });
    const p = goalProgress(g, { ...empty, latestWeightKg: 78 }, TODAY);
    expect(p).toMatchObject({ window: 'target', ratio: 0.5, reached: false, weightChangeKg: -2 });
    // Ganho: mesma regra, na outra direção.
    const gain = goal({ domain: 'weight', metric: 'weight_kg', targetValue: 60, startValue: 55 });
    expect(goalProgress(gain, { ...empty, latestWeightKg: 60.2 }, TODAY).reached).toBe(true);
    // Manutenção: dentro da tolerância.
    const keep = goal({ domain: 'weight', metric: 'weight_kg', targetValue: 70, startValue: 70 });
    expect(goalProgress(keep, { ...empty, latestWeightKg: 70.6 }, TODAY).reached).toBe(true);
    // Nenhum campo de sequência ou recompensa no progresso.
    expect(Object.keys(p)).not.toContain('streak');
  });

  it('prazo encerrado sem alcançar é sinalizado sem juízo', () => {
    const p = goalProgress(goal({ targetDay: '2026-10-01' }), empty, TODAY);
    expect(p).toMatchObject({ deadlinePassed: true, current: 0, reached: false });
  });

  it('constância de registro não conta dia só com pesagem (LEG-M06)', () => {
    const body = [
      {
        id: 'b',
        measuredAt: '2026-10-06T10:00:00Z',
        day: '2026-10-06',
        weightKg: 70,
        heightCm: null,
        waistCm: null,
        hipCm: null,
        armCm: null,
        thighCm: null,
        chestCm: null,
        bodyFatPct: null,
      },
    ];
    const data = { ...empty, body, activities: [activity('2026-10-05', 20)] };
    expect(loggedDays(data, { from: '2026-10-05', to: TODAY })).toBe(1);
  });

  it('resultados por semana completa, depois da criação da meta', () => {
    const data = {
      ...empty,
      activities: [activity('2026-09-22', 160), activity('2026-09-29', 40)],
    };
    const weeks = weeklyResults(
      goal({ createdDay: '2026-09-20' }),
      data,
      { from: '2026-09-01', to: TODAY },
      TODAY,
    );
    expect(weeks).toEqual([
      { weekEnd: '2026-09-27', value: 160, reached: true },
      { weekEnd: '2026-10-04', value: 40, reached: false },
    ]);
  });
});

describe('formulário de meta', () => {
  it('domínio vem da métrica; hábito exigido só na meta de hábito', () => {
    expect(goalInputSchema.parse({ metric: 'weight_kg', targetValue: '72,46' })).toEqual({
      domain: 'weight',
      metric: 'weight_kg',
      targetValue: 72.5,
      habitId: null,
      targetDay: null,
    });
    expect(
      goalInputSchema.safeParse({ metric: 'habit_completion_pct', targetValue: '80' }).success,
    ).toBe(false);
    expect(
      goalInputSchema.safeParse({ metric: 'logging_days_week', targetValue: '9' }).success,
    ).toBe(false);
  });
});

describe('meta de peso reavaliada na leitura (LEG-M04, revisão M1)', () => {
  const weight = goal({
    domain: 'weight',
    metric: 'weight_kg',
    targetValue: 58,
    startValue: 56,
    targetDay: '2027-10-07',
  });

  it('"ganho" que virou perda até IMC abaixo do mínimo é suspensa', () => {
    // Criada como ganho (56 → 58); a pessoa voltou ao peso real (60) com 1,80 m: 58 kg = IMC 17,9.
    expect(weightGoalSuspension(weight, 60, 180, TODAY)).toEqual(['target_below_safe_range']);
  });

  it('altura corrigida depois, ritmo que ficou rápido e meta reativada também são reavaliados', () => {
    const loss = goal({
      domain: 'weight',
      metric: 'weight_kg',
      targetValue: 76,
      targetDay: '2026-10-21',
    });
    expect(weightGoalSuspension(loss, 80, 175, TODAY)).toEqual(['pace_too_fast']);
    expect(weightGoalSuspension(loss, 80, null, TODAY)).toContain('height_required');
  });

  it('ganho, manutenção, prazo vencido sem ritmo e meta arquivada seguem sem aviso', () => {
    expect(weightGoalSuspension(weight, 56, 180, TODAY)).toEqual([]);
    expect(weightGoalSuspension({ ...weight, targetValue: 60 }, 60, 180, TODAY)).toEqual([]);
    const ended = goal({
      domain: 'weight',
      metric: 'weight_kg',
      targetValue: 76,
      targetDay: '2026-10-01',
    });
    expect(weightGoalSuspension(ended, 80, 175, TODAY)).toEqual([]);
    expect(weightGoalSuspension({ ...weight, status: 'archived' }, 60, 180, TODAY)).toEqual([]);
    expect(weightGoalSuspension(goal({}), 60, 180, TODAY)).toEqual([]);
  });
});
