/**
 * Módulo `goals` (§30, LEG-M04, LEG-M06, LEG-F05, ADR-0029). API pública sem dependência de servidor: tipos,
 * schemas e progresso. Serviço: `./service`. Toda meta passa por `checkGoal` (`@/modules/guardrails`).
 */
export { weightGoalSuspension } from './guard';
export * from './progress';
export { goalInputSchema, type GoalInput } from './schemas';
export * from './types';
