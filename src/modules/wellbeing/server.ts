import 'server-only';
import { withUser } from '@/lib/db';
import type { DateRange } from '@/lib/period';
import { logger } from '@/lib/logger';

/**
 * Pedido de revisão do Índice de Bem-Estar (art. 20 da LGPD, LEG-D08). Abre um `PrivacyRequest`
 * `automated_review` pela função do banco, com a versão do Índice e o período, nunca valores de saúde.
 * Idempotente: com um pedido aberto, devolve o mesmo (sem duplicar nem gerar spam).
 * `LEGAL-REVIEW`: quem atende e como responde o pedido (OPEN_ISSUES).
 */
export async function requestScoreReview(
  userId: string,
  version: number,
  range: DateRange,
): Promise<{ id: string; dueAt: Date }> {
  const result = await withUser(userId, async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT app.privacy_request_score_review(${version}::smallint, ${range.from}::date,
                                              ${range.to}::date)::text AS id`;
    const id = rows[0]?.id ?? '';
    const request = await tx.privacyRequest.findUniqueOrThrow({
      where: { id },
      select: { dueAt: true },
    });
    return { id, dueAt: request.dueAt };
  });
  logger.info('wellbeing.review_requested', { operation: `score_v${version}` });
  return result;
}
