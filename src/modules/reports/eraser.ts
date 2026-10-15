import type { Tx } from '@/lib/db';

/**
 * Eliminação dos pedidos de exportação após a revogação (ADR-0032, LEG-D04). `DELETE` sem `WHERE`, como em
 * `src/modules/sleep/eraser.ts`. Os arquivos no storage saem pelo `eraseObjects` do eliminador.
 */
export function eraseExportJobs(tx: Tx): Promise<number> {
  return tx.$executeRaw`DELETE FROM public.data_export_jobs`;
}
