import {
  checkCalorieTarget,
  checkRecommendationTopic,
  checkWeightGoal,
  GUARDRAIL_RULES,
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

  it('alvo abaixo do IMC mínimo é bloqueado, mesmo com prazo longo ou como ganho', () => {
    // 175 cm: IMC 18,5 ≈ 56,7 kg.
    expect(goal({ targetWeightKg: 55, targetDay: '2028-10-08' })).toEqual({
      ok: false,
      reasons: ['target_below_safe_range'],
    });
    expect(goal({ currentWeightKg: 50, targetWeightKg: 54 })).toEqual({
      ok: false,
      reasons: ['target_below_safe_range'],
    });
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

describe('temas de recomendação (§28)', () => {
  it('só sono, rotina, hábitos, movimento, hidratação, pausas e registro', () => {
    expect(checkRecommendationTopic('sleep')).toEqual({ ok: true });
    for (const topic of ['weight_loss', 'fasting', 'diet', 'calorie_restriction', 'appearance']) {
      expect(checkRecommendationTopic(topic)).toEqual({
        ok: false,
        reasons: ['topic_not_allowed'],
      });
    }
  });
});
