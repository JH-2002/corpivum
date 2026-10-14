export const ACTIVITY_TYPES = [
  'walking',
  'running',
  'cycling',
  'swimming',
  'strength',
  'stretching',
  'dance',
  'sport',
  'other',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Máximo de séries por atividade. */
export const MAX_SETS = 50;

/** Série de força como a interface recebe. O nome do exercício é decifrado no servidor. */
export interface StrengthSetRecord {
  exercise: string;
  setIndex: number;
  reps: number;
  /** `null` = sem carga externa (peso do corpo). */
  loadKg: number | null;
}

/**
 * Atividade como a interface recebe (§26). Mesma forma para dados reais e de demo. Sem calorias gastas
 * (`NUTRITION_RULES.showExerciseCalories`, LEG-M07).
 */
export interface ActivityRecord {
  id: string;
  /** Instante ISO (UTC). */
  startedAt: string;
  day: string;
  time: string;
  type: ActivityType;
  durationMin: number;
  intensity: number | null;
  distanceKm: number | null;
  note: string | null;
  sets: StrengthSetRecord[];
}
