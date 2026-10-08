import { z } from 'zod';
import { idSchema, isoDateSchema, optionalInt } from '@/modules/health/zod';
import { HABIT_FREQUENCIES } from './types';

/** Criação/edição de hábito (§22). */
export const habitInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    frequency: z.enum(HABIT_FREQUENCIES),
    weekdays: z
      .array(z.coerce.number().int().min(0).max(6))
      .max(7)
      .transform((l) => [...new Set(l)].sort((a, b) => a - b)),
    timesPerWeek: optionalInt(1, 7),
  })
  .transform((v) => ({
    name: v.name,
    frequency: v.frequency,
    weekdays: v.frequency === 'weekdays' ? v.weekdays : [],
    timesPerWeek: v.frequency === 'times_per_week' ? (v.timesPerWeek ?? null) : null,
  }))
  .refine((v) => v.frequency !== 'weekdays' || v.weekdays.length > 0, {
    path: ['weekdays'],
    message: 'weekdays_required',
  })
  .refine((v) => v.frequency !== 'times_per_week' || v.timesPerWeek !== null, {
    path: ['timesPerWeek'],
    message: 'times_required',
  });

export type HabitInput = z.infer<typeof habitInputSchema>;

/** Check rápido do dia (dashboard e página de hábitos). */
export const habitCheckSchema = z.object({
  habitId: idSchema,
  day: isoDateSchema,
  done: z.enum(['true', 'false']).transform((v) => v === 'true'),
});

export const streaksSchema = z.object({
  enabled: z.enum(['true', 'false']).transform((v) => v === 'true'),
});
