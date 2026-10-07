/**
 * Módulo `habits` (§22, LEG-F05, ADR-0021). API pública sem dependência de servidor: tipos, schemas e
 * métricas. Serviço: `./service`; integração com o Next: `./server`.
 */
export * from './metrics';
export { habitCheckSchema, habitInputSchema, streaksSchema, type HabitInput } from './schemas';
export {
  HABIT_FREQUENCIES,
  type HabitCheckRecord,
  type HabitFrequency,
  type HabitRecord,
} from './types';
