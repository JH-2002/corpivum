/**
 * Módulo `sleep` (§20, ADR-0021). API pública sem dependência de servidor: tipos, schemas e métricas.
 * Serviço: `./service`; integração com o Next: `./server`.
 */
export * from './metrics';
export { sleepInputSchema, type SleepInput } from './schemas';
export type { SleepRecord } from './types';
