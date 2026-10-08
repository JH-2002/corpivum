import { z } from 'zod';
import type { PageSearchParams } from '@/components/shell/ModulePage';
import { journalFilterSchema, type JournalFilter } from '@/modules/journal';
import type { JournalLayout } from './JournalView';

const layoutSchema = z.enum(['lista', 'calendario']).catch('lista');

/** Filtros do diário vindos da URL (humor, etiqueta, visualização), validados por Zod. */
export async function readJournalParams(
  searchParams: PageSearchParams,
): Promise<{ filter: JournalFilter; layout: JournalLayout }> {
  const p = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const parsed = journalFilterSchema.safeParse({ mood: one(p.humor), tag: one(p.etiqueta) });
  return {
    filter: parsed.success ? parsed.data : {},
    layout: layoutSchema.parse(one(p.vista)),
  };
}
