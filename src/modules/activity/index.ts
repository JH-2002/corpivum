/**
 * Módulo `activity` (§26, LEG-M08, ADR-0029). API pública sem dependência de servidor: tipos, schemas e
 * métricas. Serviço: `./service`.
 */
export * from './metrics';
export {
  activityInputSchema,
  setsFromForm,
  strengthSetSchema,
  type ActivityInput,
} from './schemas';
export * from './types';
