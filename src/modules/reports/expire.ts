import type { Tx } from '@/lib/db';

/**
 * Revogação do consentimento de saúde (ADR-0032): os links de exportação vencem na hora, na MESMA transação
 * da revogação e ANTES dela (depois, o RLS já não deixaria atualizar as linhas). Pedidos ainda na fila ou em
 * geração viram `expired` (a geração confere o estado e descarta o arquivo); os prontos vencem agora e o job
 * `reports.expire` apaga os arquivos na próxima execução.
 */
export async function expireExportsIn(tx: Tx): Promise<void> {
  await tx.$executeRaw`UPDATE public.data_export_jobs
     SET status = CASE WHEN status = 'ready' THEN status ELSE 'expired'::data_export_status END,
         expires_at = now(), updated_at = now()
   WHERE status IN ('queued', 'processing', 'ready')`;
}
