/**
 * Módulo `body` (§23, LEG-M04, ADR-0021). API pública sem dependência de servidor: tipos, schemas e
 * métricas. Serviço: `./service`; integração com o Next: `./server`.
 */
export * from './metrics';
export { BODY_RANGES, bodyInputSchema, type BodyInput } from './schemas';
export { BODY_FIELDS, type BodyField, type BodyRecord } from './types';
