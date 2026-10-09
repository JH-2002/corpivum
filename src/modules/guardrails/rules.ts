import { daysBetween } from '@/lib/dates';
import { bmi } from '@/modules/body';

/**
 * Guardrails de imagem corporal e alimentação (LEG-M04, LEG-M07, ADR-0027). Funções puras, usadas por
 * metas, recomendações e respostas de IA antes de aceitar ou sugerir qualquer alvo.
 *
 * `LEGAL-REVIEW` + revisão clínica obrigatória (OI-23): os limiares abaixo são rascunho conservador. Mudar
 * um limiar muda o que o app aceita: atualize os testes e o OI.
 */
export const GUARDRAIL_RULES = Object.freeze({
  /** IMC mínimo de uma meta de peso (LEG-M04). */
  minTargetBmi: 18.5,
  /** Ritmo máximo de perda de peso, em % do peso atual por semana. */
  maxWeeklyLossPercent: 1,
  /**
   * Piso de meta calórica diária (kcal). Sem dado de sexo, vale o piso mais alto usado como referência
   * geral para dietas sem acompanhamento profissional.
   */
  minDailyKcal: 1500,
});

/** Temas que uma recomendação pode ter (§28). Fora disso, nada é sugerido. */
export const ALLOWED_RECOMMENDATION_TOPICS = [
  'sleep',
  'routine',
  'habits',
  'movement',
  'hydration',
  'breaks',
  'logging',
] as const;
export type RecommendationTopic = (typeof ALLOWED_RECOMMENDATION_TOPICS)[number];

export const GUARDRAIL_REASONS = [
  'target_below_safe_range',
  'pace_too_fast',
  'height_required',
  'invalid_date',
  'calorie_target_below_floor',
  'topic_not_allowed',
] as const;
export type GuardrailReason = (typeof GUARDRAIL_REASONS)[number];

/**
 * Resultado de um guardrail. Bloqueado = a interface não aceita nem sugere o alvo e mostra a orientação
 * para buscar profissional de saúde, com o apoio (CVV 188 / SAMU 192, §48). Sem números restritivos e sem
 * propor uma versão "mais leve" da mesma restrição.
 */
export type GuardrailResult = { ok: true } | { ok: false; reasons: GuardrailReason[] };

const result = (reasons: GuardrailReason[]): GuardrailResult =>
  reasons.length === 0 ? { ok: true } : { ok: false, reasons };

export interface WeightGoalInput {
  currentWeightKg: number;
  /** Altura informada; sem ela, meta de perda não é aceita (não dá para conferir o limite). */
  heightCm: number | null;
  targetWeightKg: number;
  today: string;
  targetDay: string;
}

/** Meta de peso (§30, LEG-M04): nunca abaixo do IMC mínimo nem com perda mais rápida que o limite. */
export function checkWeightGoal(input: WeightGoalInput): GuardrailResult {
  const reasons: GuardrailReason[] = [];
  const loss = input.currentWeightKg - input.targetWeightKg;
  const targetBmi = bmi(input.targetWeightKg, input.heightCm);
  if (targetBmi !== null && targetBmi < GUARDRAIL_RULES.minTargetBmi) {
    reasons.push('target_below_safe_range');
  }
  if (loss > 0) {
    if (input.heightCm === null) reasons.push('height_required');
    const days = daysBetween(input.today, input.targetDay);
    if (days <= 0) {
      reasons.push('invalid_date');
    } else {
      const weeklyPercent = (loss / input.currentWeightKg / (days / 7)) * 100;
      if (weeklyPercent > GUARDRAIL_RULES.maxWeeklyLossPercent) reasons.push('pace_too_fast');
    }
  }
  return result(reasons);
}

/** Meta calórica diária (LEG-M07): nunca abaixo do piso. */
export function checkCalorieTarget(kcalPerDay: number): GuardrailResult {
  return result(kcalPerDay < GUARDRAIL_RULES.minDailyKcal ? ['calorie_target_below_floor'] : []);
}

/** Tema de recomendação (§28, LEG-M04, LEG-M07): sem perda de peso, jejum, dieta ou aparência. */
export function checkRecommendationTopic(topic: string): GuardrailResult {
  return result(
    (ALLOWED_RECOMMENDATION_TOPICS as readonly string[]).includes(topic)
      ? []
      : ['topic_not_allowed'],
  );
}
