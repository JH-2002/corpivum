import { z } from 'zod';
import {
  isoDateSchema,
  localDateTimeSchema,
  optionalInt,
  optionalText,
  requiredInt,
} from '@/modules/health/zod';
import { MEAL_CATEGORIES } from './types';

/**
 * Refeição (§25). Categoria + horário bastam (registro em até 3 toques); o resto é opcional. A caloria só
 * é aceita no servidor com a estimativa ligada (`checkCalorieEstimate`, LEG-M07).
 */
export const mealInputSchema = z.object({
  eatenAt: localDateTimeSchema,
  category: z.enum(MEAL_CATEGORIES),
  description: optionalText(300),
  hunger: optionalInt(1, 5),
  fullness: optionalInt(1, 5),
  satisfaction: optionalInt(1, 5),
  kcalEstimate: optionalInt(1, 5000),
  note: optionalText(1000),
});
export type MealInput = z.infer<typeof mealInputSchema>;

export const waterInputSchema = z.object({
  day: isoDateSchema,
  ml: requiredInt(1, 5000),
});
export type WaterInput = z.infer<typeof waterInputSchema>;

export const calorieEstimateSchema = z.object({
  enabled: z.enum(['true', 'false']).transform((v) => v === 'true'),
});
