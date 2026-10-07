import type { Db } from '@/lib/db/client';
import { withUserOn } from '@/lib/db/rls';
import type { Logger } from '@/lib/logger';

/**
 * Central de Privacidade: pedidos do titular, encerramento de conta de menor e retenção (LEG-D07, LEG-F04,
 * LEG-R02, LEG-R03). Toda leitura de dado de usuário roda com `app.user_id` (LEG-S03).
 */
export interface PrivacyDeps {
  db: Db;
  logger: Logger;
  /** Reautenticação (senha atual), com limite por usuário (módulo auth). */
  verifyPassword: (userId: string, password: string) => Promise<boolean>;
  accessLogRetentionDays: number;
  proofRetentionDays: number;
}

export type PrivacyRequestKind =
  | 'confirmation_access'
  | 'correction'
  | 'portability'
  | 'deletion'
  | 'anonymization'
  | 'sharing_info'
  | 'automated_review'
  | 'minor_closure';

export type PrivacyRequestStatus = 'open' | 'in_progress' | 'completed' | 'rejected';

export interface PrivacyRequestSummary {
  id: string;
  kind: PrivacyRequestKind;
  status: PrivacyRequestStatus;
  createdAt: Date;
  dueAt: Date;
}

export function createPrivacyService(deps: PrivacyDeps) {
  const { db, logger } = deps;

  return {
    /** Pedidos ainda não concluídos (a criação dos demais tipos chega na Fase 6). */
    async listOpenRequests(userId: string): Promise<PrivacyRequestSummary[]> {
      return withUserOn(db, userId, (tx) =>
        tx.privacyRequest.findMany({
          where: { status: { in: ['open', 'in_progress'] } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, kind: true, status: true, createdAt: true, dueAt: true },
        }),
      );
    },

    /**
     * Encerramento para quem se descobre menor (LEG-F04). Confirmação reforçada: senha atual. A conta e os
     * dados saem na hora; fica só a prova mínima (pedido e AuditLog, sem e-mail; LEG-R03).
     */
    async closeMinorAccount(userId: string, password: string): Promise<boolean> {
      if (!(await deps.verifyPassword(userId, password))) return false;
      await withUserOn(db, userId, (tx) => tx.$queryRaw`SELECT app.account_close_minor()::text`);
      logger.info('privacy.minor_account_closed', { userId });
      return true;
    },

    /** Registros de acesso além de ACCESS_LOG_RETENTION_DAYS (LEG-R02). */
    async purgeAccessLogs(): Promise<number> {
      const rows = await db.$queryRaw<Array<{ n: number }>>`
        SELECT app.privacy_purge_access_logs(${deps.accessLogRetentionDays}::int) AS n`;
      const n = rows[0]?.n ?? 0;
      logger.info('privacy.access_logs_purged', { count: n });
      return n;
    },

    /** Provas além de PROOF_RETENTION_DAYS (LEG-R03, LEGAL-REVIEW OI-04). */
    async purgeProofs(): Promise<number> {
      const rows = await db.$queryRaw<Array<{ n: number }>>`
        SELECT app.privacy_purge_proofs(${deps.proofRetentionDays}::int) AS n`;
      const n = rows[0]?.n ?? 0;
      logger.info('privacy.proofs_purged', { count: n });
      return n;
    },

    /** Contas com eliminação de dados de saúde vencida (rede de segurança do agendamento). */
    async dueHealthEliminations(limit = 500): Promise<string[]> {
      const rows = await db.$queryRaw<Array<{ user_id: string }>>`
        SELECT user_id FROM app.privacy_due_health_eliminations(${limit}::int)`;
      return rows.map((r) => r.user_id);
    },
  };
}

export type PrivacyService = ReturnType<typeof createPrivacyService>;
