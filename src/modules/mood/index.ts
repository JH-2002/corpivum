/**
 * Módulo `mood` (§21, ADR-0021). API pública sem dependência de servidor: tipos, schemas e métricas.
 * Serviço: `./service`; integração com o Next: `./server`.
 */
export * from './metrics';
export { LOW_MOOD_SUPPORT_THRESHOLD, moodInputSchema, type MoodInput } from './schemas';
export { MOOD_EMOTIONS, type MoodEmotion, type MoodRecord } from './types';
