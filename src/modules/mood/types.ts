/** Etiquetas fixas de emoção (enum `mood_emotion` do banco). Lista fechada, sem texto livre. */
export const MOOD_EMOTIONS = [
  'calm',
  'joy',
  'gratitude',
  'motivation',
  'focus',
  'tiredness',
  'worry',
  'irritation',
  'sadness',
  'boredom',
] as const;
export type MoodEmotion = (typeof MOOD_EMOTIONS)[number];

/** Registro de humor/energia/estresse (1–5) como a interface o recebe. */
export interface MoodRecord {
  id: string;
  loggedAt: string;
  /** Dia local do registro. */
  day: string;
  mood: number;
  energy: number;
  stress: number;
  emotions: MoodEmotion[];
  note: string | null;
}
