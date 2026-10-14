import { allowsMilestone } from '@/modules/guardrails';
import type { GoalProgress, GoalRecord } from '@/modules/goals';
import { int, sentence } from './rules';
import type { ModuleInsights } from './types';

export interface GoalsInsightsInput {
  goals: GoalRecord[];
  progress: GoalProgress[];
}

/**
 * Resumo das metas (§30). Conta metas ativas e as que já alcançaram o alvo na semana; peso e calorias
 * ficam fora da contagem de alcançadas (sem recompensa ligada a peso ou comida, LEG-M06/M07). Prazo
 * encerrado é dito em tom neutro, com a opção de ajustar ou arquivar (LEG-F05).
 */
export function goalsInsights({ goals, progress }: GoalsInsightsInput): ModuleInsights {
  const base = { module: 'goals' as const, highlights: [] };
  const active = goals.filter((g) => g.status === 'active');
  if (active.length === 0) return { ...base, state: 'empty', sentences: [sentence('empty')] };
  const byId = new Map(progress.map((p) => [p.goalId, p]));
  const countable = active.filter((g) => allowsMilestone(g.domain));
  const reached = countable.filter((g) => byId.get(g.id)?.reached).length;
  const ended = active.filter((g) => byId.get(g.id)?.deadlinePassed).length;
  return {
    ...base,
    state: 'ok',
    sentences: [
      sentence('active', { count: int(active.length) }),
      countable.length > 0
        ? sentence('reached', { reached: int(reached), total: int(countable.length) })
        : null,
      ended > 0 ? sentence('ended', { count: int(ended) }) : null,
    ].filter((s) => s !== null),
  };
}
