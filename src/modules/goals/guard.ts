import { checkGoal, type GuardrailReason } from '@/modules/guardrails';
import type { GoalRecord } from './types';

/** Motivos que suspendem o acompanhamento de uma meta de peso já gravada. */
const SUSPENDING: ReadonlySet<GuardrailReason> = new Set([
  'target_below_safe_range',
  'pace_too_fast',
  'height_required',
]);

/**
 * Reavalia uma meta de peso na leitura (LEG-M04, revisão de privacidade da Fase 4, M1). O guardrail roda ao
 * criar e editar, mas o peso e a altura mudam depois: uma meta que hoje seria de perda insegura (ou uma meta
 * reativada) não é acompanhada. A tela mostra o aviso, sem número e sem alvo. Vazio = acompanhar.
 * Prazo já vencido não conta como ritmo (a meta só fica "prazo encerrado").
 */
export function weightGoalSuspension(
  goal: GoalRecord,
  currentWeightKg: number | null,
  heightCm: number | null,
  today: string,
): GuardrailReason[] {
  if (goal.metric !== 'weight_kg' || goal.status !== 'active' || currentWeightKg === null)
    return [];
  if (goal.targetValue >= currentWeightKg) return [];
  const result = checkGoal({
    domain: 'weight',
    currentWeightKg,
    heightCm,
    targetValue: goal.targetValue,
    today,
    targetDay: goal.targetDay !== null && goal.targetDay > today ? goal.targetDay : null,
  });
  return result.ok ? [] : result.reasons.filter((r) => SUSPENDING.has(r));
}
