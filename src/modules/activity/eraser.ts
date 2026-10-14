import type { Tx } from '@/lib/db';

/**
 * Eliminação dos dados de atividade após a revogação (ADR-0019/0021, LEG-D04). `DELETE` SEM `WHERE` (ver
 * `eraseSleepData`). As séries saem primeiro, explicitamente, para não depender só da cascata.
 */
export async function eraseActivityData(tx: Tx): Promise<number> {
  const sets = await tx.$executeRaw`DELETE FROM public.strength_sets`;
  const entries = await tx.$executeRaw`DELETE FROM public.activity_entries`;
  return sets + entries;
}
