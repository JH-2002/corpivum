/**
 * Módulo `nutrition` (§25, LEG-M07, LEG-M08, ADR-0029). API pública sem dependência de servidor: tipos,
 * schemas e métricas. Serviço: `./service`.
 */
export * from './metrics';
export {
  calorieEstimateSchema,
  mealInputSchema,
  waterInputSchema,
  type MealInput,
  type WaterInput,
} from './schemas';
export * from './types';
