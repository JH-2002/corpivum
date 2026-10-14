import { daysBetween } from '@/lib/dates';
import type { GoalDomain } from '@/modules/goals';
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
  'calorie_target_below_floor',
  'height_required',
  'current_weight_required',
  'target_day_required',
  'estimate_disabled',
  'invalid_date',
  'invalid_input',
  'topic_not_allowed',
] as const;
export type GuardrailReason = (typeof GUARDRAIL_REASONS)[number];

/**
 * Motivos de segurança: o alvo em si é arriscado. Só eles mostram a orientação profissional e o apoio
 * (CVV 188 / SAMU 192); os demais são validação comum de formulário.
 */
export const SAFETY_REASONS: ReadonlySet<GuardrailReason> = new Set([
  'target_below_safe_range',
  'pace_too_fast',
  'calorie_target_below_floor',
]);

/** Peso, altura ou calorias precisam ser números finitos e positivos (não depende só do Zod da entrada). */
const positive = (v: number) => Number.isFinite(v) && v > 0;

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

/**
 * Meta de peso (§30, LEG-M04). Só metas de PERDA são limitadas: bloqueadas se levam a IMC abaixo do mínimo,
 * se a pessoa já parte de abaixo dele ou se o ritmo passa do limite. Metas de ganho ou de manutenção são
 * sempre permitidas (decisão de produto, OI-23(f)).
 */
export function checkWeightGoal(input: WeightGoalInput): GuardrailResult {
  if (
    !positive(input.currentWeightKg) ||
    !positive(input.targetWeightKg) ||
    (input.heightCm !== null && !positive(input.heightCm))
  ) {
    return result(['invalid_input']);
  }
  const loss = input.currentWeightKg - input.targetWeightKg;
  if (loss <= 0) return result([]);
  const reasons: GuardrailReason[] = [];
  const currentBmi = bmi(input.currentWeightKg, input.heightCm);
  const targetBmi = bmi(input.targetWeightKg, input.heightCm);
  if (input.heightCm === null) {
    reasons.push('height_required');
  } else if (
    (targetBmi !== null && targetBmi < GUARDRAIL_RULES.minTargetBmi) ||
    (currentBmi !== null && currentBmi < GUARDRAIL_RULES.minTargetBmi)
  ) {
    reasons.push('target_below_safe_range');
  }
  const days = daysBetween(input.today, input.targetDay);
  if (days <= 0) {
    reasons.push('invalid_date');
  } else {
    const weeklyPercent = (loss / input.currentWeightKg / (days / 7)) * 100;
    if (weeklyPercent > GUARDRAIL_RULES.maxWeeklyLossPercent) reasons.push('pace_too_fast');
  }
  return result(reasons);
}

/** Meta calórica diária (LEG-M07): nunca abaixo do piso. */
export function checkCalorieTarget(kcalPerDay: number): GuardrailResult {
  if (!positive(kcalPerDay)) return result(['invalid_input']);
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

/** Uso da estimativa calórica (LEG-M07): desligada por padrão; sem ela, nenhuma caloria é aceita. */
export const NUTRITION_RULES = Object.freeze({
  /** A estimativa de calorias começa desligada e só a própria pessoa liga. */
  calorieEstimateDefault: false,
  /** Atividade nunca mostra calorias gastas: evita a lógica de compensar comida com exercício. */
  showExerciseCalories: false,
});

/** Caloria informada numa refeição só é aceita com a estimativa ligada (LEG-M07). */
export function checkCalorieEstimate(enabled: boolean, kcal: number | null): GuardrailResult {
  if (kcal === null) return result([]);
  if (!enabled) return result(['estimate_disabled']);
  return result(positive(kcal) ? [] : ['invalid_input']);
}

/**
 * Entrada da porta única de validação de metas. Os valores de referência (peso atual, altura) vêm do
 * banco no servidor, nunca do formulário.
 */
export type GoalGuardInput =
  | {
      domain: 'weight';
      currentWeightKg: number | null;
      heightCm: number | null;
      targetValue: number;
      today: string;
      targetDay: string | null;
    }
  | { domain: 'nutrition'; calorieEstimateEnabled: boolean; targetValue: number }
  | { domain: Exclude<GoalDomain, 'weight' | 'nutrition'>; targetValue: number };

/**
 * Porta única das metas (§30, LEG-M04, LEG-M07). Toda meta criada ou editada passa por aqui. Peso usa
 * `checkWeightGoal`; calorias usam `checkCalorieTarget` e só existem com a estimativa ligada. Nenhum
 * caminho devolve um alvo alternativo: bloqueado é bloqueado.
 */
export function checkGoal(input: GoalGuardInput): GuardrailResult {
  if (!positive(input.targetValue)) return result(['invalid_input']);
  switch (input.domain) {
    case 'weight': {
      if (input.currentWeightKg === null) return result(['current_weight_required']);
      const isLoss = input.targetValue < input.currentWeightKg;
      if (!isLoss) {
        return checkWeightGoal({
          currentWeightKg: input.currentWeightKg,
          heightCm: input.heightCm,
          targetWeightKg: input.targetValue,
          today: input.today,
          targetDay: input.targetDay ?? input.today,
        });
      }
      if (input.targetDay === null) {
        // Sem prazo não dá para conferir o ritmo; as demais regras ainda valem.
        const rest = checkWeightGoal({
          currentWeightKg: input.currentWeightKg,
          heightCm: input.heightCm,
          targetWeightKg: input.targetValue,
          today: input.today,
          targetDay: input.today,
        });
        const reasons = rest.ok ? [] : rest.reasons.filter((r) => r !== 'invalid_date');
        return result(['target_day_required', ...reasons]);
      }
      return checkWeightGoal({
        currentWeightKg: input.currentWeightKg,
        heightCm: input.heightCm,
        targetWeightKg: input.targetValue,
        today: input.today,
        targetDay: input.targetDay,
      });
    }
    case 'nutrition':
      if (!input.calorieEstimateEnabled) return result(['estimate_disabled']);
      return checkCalorieTarget(input.targetValue);
    default:
      return result([]);
  }
}

/**
 * Sequência (streak) permitida? Só em hábitos, e a pessoa pode desligar (LEG-F05). Nunca ligada a peso,
 * medidas ou alimentação (LEG-M06, LEG-M07); metas não têm sequência.
 */
export function allowsStreak(domain: GoalDomain | 'body'): boolean {
  return domain === 'habits';
}

/**
 * Meta alcançada vira marco na timeline? Peso não (decisão da Fase 4, LEG-M06: sem recompensa ligada a
 * peso): a meta só muda de status, em tom neutro.
 */
export function allowsMilestone(domain: GoalDomain): boolean {
  return domain !== 'weight';
}
