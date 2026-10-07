import type { Tx } from '@/lib/db';

/** Eliminação após a revogação (ADR-0021). `DELETE` sem `WHERE`: ver `src/modules/sleep/eraser.ts`. */
export function eraseJournalData(tx: Tx): Promise<number> {
  return tx.$executeRaw`DELETE FROM public.journal_entries`;
}
