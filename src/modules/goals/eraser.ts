import type { Tx } from '@/lib/db';

/** Eliminação das metas após a revogação (ADR-0019/0021, LEG-D04). `DELETE` SEM `WHERE` (ver sono). */
export function eraseGoalsData(tx: Tx): Promise<number> {
  return tx.$executeRaw`DELETE FROM public.goals`;
}
