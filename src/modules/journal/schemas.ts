import { z } from 'zod';
import { enumList, isoDateSchema, optionalInt } from '@/modules/health/zod';
import { JOURNAL_TAGS } from './types';

/** Entrada do diário (§19). O conteúdo vai cifrado (LEG-S02). */
export const journalInputSchema = z.object({
  day: isoDateSchema,
  content: z.string().trim().min(1).max(10_000),
  mood: optionalInt(1, 5),
  tags: enumList(JOURNAL_TAGS, JOURNAL_TAGS.length),
});

export type JournalInput = z.infer<typeof journalInputSchema>;

/**
 * Filtros permitidos (SPEC_ADDENDUM §19): data, humor numérico e etiquetas. NÃO há busca textual no
 * conteúdo: ele é cifrado e não pesquisável no banco (LEG-S02).
 */
export const journalFilterSchema = z.object({
  mood: optionalInt(1, 5),
  tag: z.enum(JOURNAL_TAGS).optional().catch(undefined),
});

export type JournalFilter = z.infer<typeof journalFilterSchema>;
