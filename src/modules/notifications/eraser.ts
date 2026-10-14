import type { Tx } from '@/lib/db';

/**
 * Eliminação dos lembretes após a revogação (ADR-0019/0021, LEG-D04). `DELETE` SEM `WHERE` (ver sono). Os
 * jobs já agendados encontram o lembrete apagado e param sozinhos (cancelamento é de domínio, ADR-0020).
 */
export function eraseRemindersData(tx: Tx): Promise<number> {
  return tx.$executeRaw`DELETE FROM public.reminders`;
}
