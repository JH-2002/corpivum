/** Até quantos dias para trás um check pode ser marcado (corrigir esquecimentos recentes). */
export const CHECK_BACKFILL_DAYS = 7;

/** Janela de histórico usada para calcular a sequência (streak). */
export const STREAK_LOOKBACK_DAYS = 120;

export const HABIT_FREQUENCIES = ['daily', 'weekdays', 'times_per_week'] as const;
export type HabitFrequency = (typeof HABIT_FREQUENCIES)[number];

/** Hábito como a interface o recebe. O nome é decifrado no servidor. */
export interface HabitRecord {
  id: string;
  name: string;
  frequency: HabitFrequency;
  /** Dias da semana (0 = domingo) quando `weekdays`. */
  weekdays: number[];
  timesPerWeek: number | null;
  archived: boolean;
  /** Dia local de criação: não há expectativa antes dele. */
  createdDay: string;
}

export interface HabitCheckRecord {
  habitId: string;
  day: string;
}
