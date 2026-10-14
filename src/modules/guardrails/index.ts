/**
 * Módulo `guardrails` (LEG-M04, LEG-M06, LEG-M07, ADR-0027): regras puras de imagem corporal e
 * alimentação. Sem React e sem servidor; seguro para componentes cliente.
 */
export {
  allowsMilestone,
  allowsStreak,
  checkCalorieEstimate,
  checkCalorieTarget,
  checkGoal,
  checkWeightGoal,
  GUARDRAIL_REASONS,
  GUARDRAIL_RULES,
  NUTRITION_RULES,
  SAFETY_REASONS,
  type GoalGuardInput,
  type GuardrailReason,
  type GuardrailResult,
  type WeightGoalInput,
} from './rules';
