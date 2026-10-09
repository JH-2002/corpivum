/**
 * Módulo `guardrails` (LEG-M04, LEG-M06, LEG-M07, ADR-0027): regras puras de imagem corporal e
 * alimentação. Sem React e sem servidor; seguro para componentes cliente.
 */
export {
  ALLOWED_RECOMMENDATION_TOPICS,
  checkCalorieTarget,
  checkRecommendationTopic,
  checkWeightGoal,
  GUARDRAIL_REASONS,
  GUARDRAIL_RULES,
  type GuardrailReason,
  type GuardrailResult,
  type RecommendationTopic,
  type WeightGoalInput,
} from './rules';
