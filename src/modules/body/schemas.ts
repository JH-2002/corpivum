import { z } from 'zod';
import { localDateTimeSchema, optionalDecimal } from '@/modules/health/zod';
import { BODY_FIELDS } from './types';

/** Faixas aceitas (iguais aos CHECK do banco). */
export const BODY_RANGES = {
  weightKg: [20, 400],
  heightCm: [50, 260],
  waistCm: [10, 300],
  hipCm: [10, 300],
  armCm: [10, 300],
  thighCm: [10, 300],
  chestCm: [10, 300],
  bodyFatPct: [1, 80],
} as const;

/** Medição (§23). Pelo menos um campo informado. */
export const bodyInputSchema = z
  .object({
    measuredAt: localDateTimeSchema,
    weightKg: optionalDecimal(...BODY_RANGES.weightKg),
    heightCm: optionalDecimal(...BODY_RANGES.heightCm),
    waistCm: optionalDecimal(...BODY_RANGES.waistCm),
    hipCm: optionalDecimal(...BODY_RANGES.hipCm),
    armCm: optionalDecimal(...BODY_RANGES.armCm),
    thighCm: optionalDecimal(...BODY_RANGES.thighCm),
    chestCm: optionalDecimal(...BODY_RANGES.chestCm),
    bodyFatPct: optionalDecimal(...BODY_RANGES.bodyFatPct),
  })
  .refine((v) => BODY_FIELDS.some((f) => v[f] !== undefined), {
    path: ['weightKg'],
    message: 'at_least_one',
  });

export type BodyInput = z.infer<typeof bodyInputSchema>;
