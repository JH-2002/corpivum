import { z } from 'zod';
import { enumList, localDateTimeSchema, optionalText, requiredInt } from '@/modules/health/zod';
import { MOOD_EMOTIONS } from './types';

/** Entrada do registro rápido de humor (§21). */
export const moodInputSchema = z.object({
  loggedAt: localDateTimeSchema,
  mood: requiredInt(1, 5),
  energy: requiredInt(1, 5),
  stress: requiredInt(1, 5),
  emotions: enumList(MOOD_EMOTIONS, MOOD_EMOTIONS.length),
  note: optionalText(500),
});

export type MoodInput = z.infer<typeof moodInputSchema>;

/** Humor registrado no ponto mais baixo da escala: a tela mostra apoio (CVV 188 / SAMU 192, §48). */
export const LOW_MOOD_SUPPORT_THRESHOLD = 1;
