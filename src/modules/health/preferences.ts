import type { Tx } from '@/lib/db';

/**
 * Preferências de interface da conta que não são dado de saúde (ADR-0025): rodam com `app.user_id` (RLS),
 * sem consentimento de saúde. Recebem a transação para serem testadas no banco de testes.
 */
export async function readTourSeen(tx: Tx, userId: string): Promise<boolean> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { tourSeen: true } });
  return user?.tourSeen ?? false;
}

/** Marca o tour do painel como visto (concluído ou pulado). Idempotente. */
export async function writeTourSeen(tx: Tx, userId: string): Promise<void> {
  await tx.user.update({ where: { id: userId }, data: { tourSeen: true } });
}
