import { z } from 'zod';
import {
  localDateTimeSchema,
  optionalDecimal,
  optionalInt,
  optionalText,
  requiredInt,
} from '@/modules/health/zod';
import { ACTIVITY_TYPES, MAX_SETS } from './types';

export const strengthSetSchema = z.object({
  exercise: z.string().trim().min(1).max(80),
  reps: requiredInt(1, 1000),
  loadKg: optionalDecimal(0, 1000),
});

/**
 * Atividade (§26). Tipo + duração bastam; séries de força são opcionais. O app registra, não prescreve
 * carga, série nem treino (LEG-M08).
 */
export const activityInputSchema = z.object({
  startedAt: localDateTimeSchema,
  type: z.enum(ACTIVITY_TYPES),
  durationMin: requiredInt(1, 1440),
  intensity: optionalInt(1, 10),
  distanceKm: optionalDecimal(0.01, 1000),
  note: optionalText(1000),
  sets: z.array(strengthSetSchema).max(MAX_SETS).default([]),
});
export type ActivityInput = z.infer<typeof activityInputSchema>;

/**
 * Linhas de série vindas do formulário em listas paralelas (`setExercise`, `setReps`, `setLoad`). Linhas
 * totalmente vazias são ignoradas; as demais seguem para a validação.
 */
export function setsFromForm(
  exercises: readonly unknown[],
  reps: readonly unknown[],
  loads: readonly unknown[],
): Array<{ exercise: unknown; reps: unknown; loadKg: unknown }> {
  const blank = (v: unknown) => v === undefined || (typeof v === 'string' && v.trim() === '');
  const rows: Array<{ exercise: unknown; reps: unknown; loadKg: unknown }> = [];
  const n = Math.max(exercises.length, reps.length, loads.length);
  for (let i = 0; i < n; i += 1) {
    const row = { exercise: exercises[i], reps: reps[i], loadKg: loads[i] };
    if (blank(row.exercise) && blank(row.reps) && blank(row.loadKg)) continue;
    rows.push(row);
  }
  return rows;
}
