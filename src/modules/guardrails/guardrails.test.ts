import {
  allowsMilestone,
  allowsStreak,
  checkCalorieEstimate,
  checkCalorieTarget,
  checkGoal,
  checkWeightGoal,
  GUARDRAIL_RULES,
  NUTRITION_RULES,
  type WeightGoalInput,
} from './index';

const TODAY = '2026-10-08';
const goal = (over: Partial<WeightGoalInput> = {}) =>
  checkWeightGoal({
    currentWeightKg: 80,
    heightCm: 175,
    targetWeightKg: 76,
    today: TODAY,
    targetDay: '2027-01-08',
    ...over,
  });

describe('meta de peso (LEG-M04)', () => {
  it('perda gradual dentro dos limites é aceita', () => {
    expect(goal()).toEqual({ ok: true });
  });

  it('perda que leva a IMC abaixo do mínimo é bloqueada, mesmo com prazo longo', () => {
    // 175 cm: IMC 18,5 ≈ 56,7 kg.
    expect(goal({ currentWeightKg: 60, targetWeightKg: 55, targetDay: '2028-10-08' })).toEqual({
      ok: false,
      reasons: ['target_below_safe_range'],
    });
  });

  it('perda de quem já está abaixo do IMC mínimo é bloqueada', () => {
    expect(goal({ currentWeightKg: 55, targetWeightKg: 54.5, targetDay: '2027-10-08' })).toEqual({
      ok: false,
      reasons: ['target_below_safe_range'],
    });
  });

  it('ganho e manutenção são sempre permitidos, inclusive abaixo do IMC mínimo e sem altura', () => {
    expect(goal({ currentWeightKg: 50, targetWeightKg: 54 })).toEqual({ ok: true });
    expect(goal({ currentWeightKg: 50, targetWeightKg: 50 })).toEqual({ ok: true });
    expect(goal({ currentWeightKg: 50, targetWeightKg: 70, targetDay: TODAY })).toEqual({
      ok: true,
    });
    expect(goal({ heightCm: null, targetWeightKg: 82 })).toEqual({ ok: true });
  });

  it('perda mais rápida que o limite semanal é bloqueada', () => {
    // 8 kg em 4 semanas = 2,5% do peso por semana.
    expect(goal({ targetWeightKg: 72, targetDay: '2026-11-05' })).toEqual({
      ok: false,
      reasons: ['pace_too_fast'],
    });
    expect(GUARDRAIL_RULES.maxWeeklyLossPercent).toBe(1);
  });

  it('meta de perda sem altura não é aceita; ganho e manutenção não precisam de altura', () => {
    expect(goal({ heightCm: null })).toEqual({ ok: false, reasons: ['height_required'] });
    expect(goal({ heightCm: null, targetWeightKg: 82 })).toEqual({ ok: true });
    expect(goal({ targetWeightKg: 80 })).toEqual({ ok: true });
  });

  it('prazo hoje ou no passado é inválido para perda', () => {
    expect(goal({ targetDay: TODAY })).toEqual({ ok: false, reasons: ['invalid_date'] });
  });
});

describe('entrada inválida (revisão de privacidade M7)', () => {
  it('peso, altura ou calorias não finitos ou não positivos bloqueiam', () => {
    for (const over of [
      { targetWeightKg: 0 },
      { currentWeightKg: Number.NaN },
      { heightCm: -170 },
      { targetWeightKg: Number.POSITIVE_INFINITY },
    ]) {
      expect(goal(over)).toEqual({ ok: false, reasons: ['invalid_input'] });
    }
    expect(checkCalorieTarget(Number.NaN)).toEqual({ ok: false, reasons: ['invalid_input'] });
    expect(checkCalorieTarget(0)).toEqual({ ok: false, reasons: ['invalid_input'] });
  });
});

describe('meta calórica (LEG-M07)', () => {
  it('abaixo do piso é bloqueada', () => {
    expect(checkCalorieTarget(1200)).toEqual({
      ok: false,
      reasons: ['calorie_target_below_floor'],
    });
    expect(checkCalorieTarget(GUARDRAIL_RULES.minDailyKcal)).toEqual({ ok: true });
  });
});

describe('porta única das metas (checkGoal, LEG-M04, LEG-M07)', () => {
  const weight = (targetValue: number, targetDay: string | null = '2027-01-08') =>
    checkGoal({
      domain: 'weight',
      currentWeightKg: 80,
      heightCm: 175,
      targetValue,
      today: TODAY,
      targetDay,
    });

  it('perda insegura é bloqueada por motivo de segurança, sem alvo alternativo', () => {
    const blocked = checkGoal({
      domain: 'weight',
      currentWeightKg: 60,
      heightCm: 175,
      targetValue: 55,
      today: TODAY,
      targetDay: '2028-10-08',
    });
    expect(blocked).toEqual({ ok: false, reasons: ['target_below_safe_range'] });
    expect(weight(72, '2026-11-05')).toEqual({ ok: false, reasons: ['pace_too_fast'] });
    // O resultado não carrega nenhum número sugerido.
    expect(Object.keys(blocked)).toEqual(['ok', 'reasons']);
  });

  it('ganho e manutenção sempre passam, com ou sem prazo', () => {
    expect(weight(85, null)).toEqual({ ok: true });
    expect(weight(80, null)).toEqual({ ok: true });
    expect(
      checkGoal({
        domain: 'weight',
        currentWeightKg: 45,
        heightCm: 175,
        targetValue: 50,
        today: TODAY,
        targetDay: null,
      }),
    ).toEqual({ ok: true });
  });

  it('perda sem prazo pede data, sem esconder os motivos de segurança', () => {
    expect(weight(76, null)).toEqual({ ok: false, reasons: ['target_day_required'] });
    expect(
      checkGoal({
        domain: 'weight',
        currentWeightKg: 60,
        heightCm: 175,
        targetValue: 55,
        today: TODAY,
        targetDay: null,
      }),
    ).toEqual({ ok: false, reasons: ['target_day_required', 'target_below_safe_range'] });
  });

  it('meta de peso sem peso atual registrado não é aceita', () => {
    expect(
      checkGoal({
        domain: 'weight',
        currentWeightKg: null,
        heightCm: 175,
        targetValue: 70,
        today: TODAY,
        targetDay: null,
      }),
    ).toEqual({ ok: false, reasons: ['current_weight_required'] });
  });

  it('meta de calorias só existe com a estimativa ligada e nunca abaixo do piso', () => {
    expect(
      checkGoal({ domain: 'nutrition', calorieEstimateEnabled: false, targetValue: 2000 }),
    ).toEqual({ ok: false, reasons: ['estimate_disabled'] });
    expect(
      checkGoal({ domain: 'nutrition', calorieEstimateEnabled: true, targetValue: 1200 }),
    ).toEqual({ ok: false, reasons: ['calorie_target_below_floor'] });
    expect(
      checkGoal({ domain: 'nutrition', calorieEstimateEnabled: true, targetValue: 2000 }),
    ).toEqual({ ok: true });
  });

  it('demais domínios não têm limite de segurança; valor não positivo é inválido', () => {
    for (const domain of ['sleep', 'activity', 'habits', 'logging'] as const) {
      expect(checkGoal({ domain, targetValue: 3 })).toEqual({ ok: true });
      expect(checkGoal({ domain, targetValue: 0 })).toEqual({
        ok: false,
        reasons: ['invalid_input'],
      });
    }
  });
});

describe('estimativa calórica (LEG-M07)', () => {
  it('desligada por padrão; caloria só é aceita com ela ligada', () => {
    expect(NUTRITION_RULES.calorieEstimateDefault).toBe(false);
    expect(NUTRITION_RULES.showExerciseCalories).toBe(false);
    expect(checkCalorieEstimate(false, null)).toEqual({ ok: true });
    expect(checkCalorieEstimate(false, 400)).toEqual({ ok: false, reasons: ['estimate_disabled'] });
    expect(checkCalorieEstimate(true, 400)).toEqual({ ok: true });
    expect(checkCalorieEstimate(true, -1)).toEqual({ ok: false, reasons: ['invalid_input'] });
  });
});

describe('sequências e marcos (LEG-M06, LEG-F05)', () => {
  it('sequência só em hábitos; nunca em peso, corpo ou alimentação', () => {
    expect(allowsStreak('habits')).toBe(true);
    for (const domain of ['weight', 'body', 'nutrition', 'sleep', 'activity', 'logging'] as const) {
      expect(allowsStreak(domain)).toBe(false);
    }
  });

  it('meta de peso ou de calorias alcançada não vira marco; as demais viram', () => {
    expect(allowsMilestone('weight')).toBe(false);
    expect(allowsMilestone('nutrition')).toBe(false);
    for (const domain of ['sleep', 'activity', 'habits', 'logging'] as const) {
      expect(allowsMilestone(domain)).toBe(true);
    }
  });
});
