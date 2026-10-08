import type { Tx } from '@/lib/db';

/**
 * Eliminação dos dados de sono após a revogação (ADR-0019/0021, LEG-D04). `DELETE` SEM `WHERE`: com
 * WHERE, o Postgres aplicaria também a política de SELECT, que exige consentimento, e nada seria apagado.
 * A política de DELETE restringe ao dono (`app.user_id` da transação).
 */
export function eraseSleepData(tx: Tx): Promise<number> {
  return tx.$executeRaw`DELETE FROM public.sleep_entries`;
}
