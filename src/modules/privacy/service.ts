import { createHash } from 'node:crypto';
import type { JobQueue } from '@/adapters/jobs/types';
import type { MailProvider } from '@/adapters/mail/types';
import { auditAppendSystem } from '@/lib/db/audit';
import type { Db } from '@/lib/db/client';
import { withUserOn } from '@/lib/db/rls';
import { AppError } from '@/lib/errors';
import type { Logger } from '@/lib/logger';
import type { HealthDataErasers, ObjectEraser } from './health-data';
import { OPENABLE_REQUEST_KINDS, type OpenableRequestKind } from './requests';

/**
 * Central de Privacidade: pedidos do titular, exclusão de conta, encerramento de conta de menor e retenção
 * (LEG-D01–D07, LEG-F04, LEG-R02, LEG-R03; ADR-0019, ADR-0034). Toda leitura de dado de usuário roda com
 * `app.user_id` (LEG-S03). Logs só com IDs técnicos e contagens (LEG-R04).
 */
export type ReauthPurpose = 'minor_closure' | 'account_deletion';

export interface PrivacyDeps {
  db: Db;
  logger: Logger;
  /**
   * Reautenticação (senha atual com limite por usuário; na exclusão, também o 2º fator se ligado; módulo
   * auth). Devolve o nonce de uso único que a ação destrutiva consome no banco, ou null.
   */
  reauthenticate: (
    userId: string,
    password: string,
    purpose: ReauthPurpose,
    mfaCode?: string,
  ) => Promise<string | null>;
  accessLogRetentionDays: number;
  proofRetentionDays: number;
  backupRetentionDays: number;
  /** Eliminadores das tabelas de saúde e dos arquivos (mesma lista da eliminação agendada). */
  erasers: HealthDataErasers;
  eraseObjects: ObjectEraser;
  mail: MailProvider;
  queue: Pick<JobQueue, 'enqueue'>;
  /** Pede a exportação completa (portabilidade; fluxo da 6a). Devolve se o pedido entrou na fila. */
  requestFullExport: (userId: string) => Promise<boolean>;
  appUrl: string;
  timeZone: string;
  /**
   * Client dos jobs (`app_worker`, ADR-0036 D5, ADR-0037): varreduras, expurgos e a purga de conta só rodam
   * nesse papel. Padrão: `db` (testes que não chamam esses métodos).
   */
  workerDb?: () => Db;
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

export { OPENABLE_REQUEST_KINDS, type OpenableRequestKind };

export type PrivacyRequestStatus = 'open' | 'in_progress' | 'completed' | 'rejected';

export interface PrivacyRequestSummary {
  id: string;
  kind: PrivacyRequestKind;
  status: PrivacyRequestStatus;
  createdAt: Date;
  dueAt: Date;
}

export type OpenRequestResult =
  { status: 'ok'; request: PrivacyRequestSummary; created: boolean } | { status: 'rate_limited' };

export type DeleteAccountResult = 'deleted' | 'invalid_credentials';

export const ACCOUNT_PURGE_JOB = 'privacy.account_purge';
export type MinorClosureResult = 'closed' | 'pending' | 'invalid_password';
export const accountPurgeKey = (userId: string) => `account-purge:${userId}`;

const sha = (value: string) => new Uint8Array(createHash('sha256').update(value).digest());

export function createPrivacyService(deps: PrivacyDeps) {
  const { db, logger } = deps;
  const erasers = Object.values(deps.erasers);
  if (erasers.length === 0) throw new AppError('VALIDATION', 'nenhum eliminador de dados de saúde');
  const longDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: deps.timeZone });
  const worker = () => deps.workerDb?.() ?? db;

  /** E-mail transacional sem conteúdo de saúde. Falha não interrompe o fluxo; o log leva só o modelo. */
  async function sendMail(
    to: string,
    template: 'privacy-request-received' | 'account-deleted' | 'onboarding-expiry-notice',
    params: Record<string, string>,
  ): Promise<boolean> {
    try {
      await deps.mail.send({ to, template, params });
      return true;
    } catch {
      logger.warn('mail.failed', { template });
      return false;
    }
  }

  async function readRequest(userId: string, id: string): Promise<PrivacyRequestSummary> {
    return withUserOn(db, userId, (tx) =>
      tx.privacyRequest.findUniqueOrThrow({
        where: { id },
        select: { id: true, kind: true, status: true, createdAt: true, dueAt: true },
      }),
    );
  }

  return {
    /** Pedidos ainda não concluídos da própria pessoa. */
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
     * Abre um pedido do titular (LEG-D07) pela função do banco (trava por pessoa, idempotente com pedido
     * aberto do mesmo tipo, prazo de 15 dias, AuditLog). Confirmação e compartilhamento são atendidos na hora;
     * portabilidade pede a exportação completa e fecha quando ela fica pronta. Pedido novo: recibo por e-mail
     * (protocolo, tipo, data e prazo; nada de saúde).
     */
    async openRequest(userId: string, kind: OpenableRequestKind): Promise<OpenRequestResult> {
      let opened: { id: string; created: boolean; email: string };
      try {
        opened = await withUserOn(db, userId, async (tx) => {
          const rows = await tx.$queryRaw<Array<{ request_id: string; created: boolean }>>`
            SELECT request_id, created
              FROM app.privacy_request_open(${kind}::public.privacy_request_kind)`;
          const row = rows[0];
          if (!row) throw new AppError('VALIDATION', 'pedido não aberto');
          if (kind === 'portability') {
            await tx.$queryRaw`SELECT app.privacy_requests_close_portability()`;
          }
          const user = await tx.user.findUniqueOrThrow({
            where: { id: userId },
            select: { email: true },
          });
          return { id: row.request_id, created: row.created, email: user.email };
        });
      } catch (error) {
        if (error instanceof Error && /privacy request rate exceeded/.test(error.message)) {
          logger.warn('privacy.request_rate_limited');
          return { status: 'rate_limited' };
        }
        throw error;
      }
      let request = await readRequest(userId, opened.id);
      if (kind === 'portability' && request.status === 'in_progress') {
        // Sem consentimento nem carência, no demo ou com o limite diário atingido, o pedido fica aberto para o
        // encarregado (atendimento manual); uma exportação pronta depois também o fecha.
        await deps.requestFullExport(userId);
        request = await readRequest(userId, opened.id);
      }
      if (opened.created) {
        await sendMail(opened.email, 'privacy-request-received', {
          protocol: request.id,
          kind: request.kind,
          openedAt: longDate.format(request.createdAt),
          dueAt: longDate.format(request.dueAt),
          url: `${deps.appUrl}/privacidade#pedidos`,
        });
        logger.info('privacy.request_opened', { requestId: request.id, operation: request.kind });
      }
      return { status: 'ok', request, created: opened.created };
    },

    /** Depois que uma exportação completa fica pronta: conclui os pedidos de portabilidade abertos. */
    async closePortability(userId: string): Promise<number> {
      const rows = await withUserOn(
        db,
        userId,
        (tx) =>
          tx.$queryRaw<Array<{ n: number }>>`SELECT app.privacy_requests_close_portability() AS n`,
      );
      return rows[0]?.n ?? 0;
    },

    /**
     * Exclusão de conta de adulto (LEG-D04): senha atual e, com MFA, o 2º fator; prova de uso único consumida no
     * banco junto com o corte do acesso (deleted_at, sessões, consentimentos, pedido `deletion`). A purga roda
     * em seguida no job `privacy.account_purge`; a varredura diária cobre um enfileiramento perdido.
     */
    async deleteAccount(
      userId: string,
      credentials: { password: string; mfaCode?: string },
    ): Promise<DeleteAccountResult> {
      const proof = await deps.reauthenticate(
        userId,
        credentials.password,
        'account_deletion',
        credentials.mfaCode,
      );
      if (!proof) return 'invalid_credentials';
      const proofHash = sha(proof);
      let deleted: { id: string; email: string; at: Date };
      try {
        deleted = await withUserOn(db, userId, async (tx) => {
          const rows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT app.account_delete(${proofHash})::text AS id`;
          const user = await tx.user.findUniqueOrThrow({
            where: { id: userId },
            select: { email: true, deletedAt: true },
          });
          return { id: rows[0]?.id ?? '', email: user.email, at: user.deletedAt ?? new Date() };
        });
      } catch (error) {
        // Segundo envio do mesmo formulário: a conta já foi excluída (revisão N4).
        if (error instanceof Error && /account not found/.test(error.message)) return 'deleted';
        throw error;
      }
      // Aviso uma vez só, logo depois do corte do acesso (revisão B1): novas tentativas da purga não reenviam.
      const sent = await sendMail(deleted.email, 'account-deleted', {
        date: longDate.format(deleted.at),
        proofDays: String(deps.proofRetentionDays),
        accessDays: String(deps.accessLogRetentionDays),
        backupDays: String(deps.backupRetentionDays),
        contactUrl: `${deps.appUrl}/legal/encarregado`,
      });
      if (sent) {
        await withUserOn(db, userId, (tx) =>
          auditAppendSystem(tx, 'account_deletion_notice_sent', 'user'),
        );
      }
      await deps.queue
        .enqueue(ACCOUNT_PURGE_JOB, { userId }, { singletonKey: accountPurgeKey(userId) })
        .catch(() => logger.warn('privacy.account_purge_enqueue_failed'));
      logger.info('privacy.account_deleted', { requestId: deleted.id });
      return 'deleted';
    },

    /**
     * Purga da conta excluída (job, em minutos): arquivos no storage, eliminadores e `app.account_purge` (conclui o
     * pedido, `account_purged`, DELETE da conta), tudo numa transação travada na linha da pessoa. Falha no storage
     * desfaz tudo e o job tenta de novo. O aviso por e-mail já saiu na exclusão.
     */
    async purgeAccount(userId: string): Promise<'purged' | 'skipped'> {
      const outcome = await withUserOn(worker(), userId, async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM public.users WHERE id = ${userId}::uuid FOR UPDATE`;
        const still = await tx.user.findUnique({
          where: { id: userId },
          select: { deletedAt: true },
        });
        if (!still?.deletedAt) return 'skipped' as const;
        await deps.eraseObjects(userId);
        for (const eraser of erasers) await eraser(tx);
        const done = await tx.$queryRaw<Array<{ ok: boolean }>>`SELECT app.account_purge() AS ok`;
        return done[0]?.ok === true ? ('purged' as const) : ('skipped' as const);
      });
      if (outcome === 'purged') logger.info('privacy.account_purged');
      return outcome;
    },

    /** Contas excluídas que ainda existem (rede de segurança do enfileiramento da purga). */
    async duePurges(limit = 500): Promise<string[]> {
      const rows = await worker().$queryRaw<Array<{ user_id: string }>>`
        SELECT user_id FROM app.account_purge_due(${limit}::int)`;
      return rows.map((r) => r.user_id);
    },

    /**
     * Prazos dos pedidos (job diário): só contagens no log, sem IDs nem pessoas. `stalled`: exclusões e
     * encerramentos com o acesso cortado e a purga parada há mais de 1 hora (revisão B4 da 7b; runbook
     * DATA_SUBJECT_REQUEST.md).
     */
    async requestDeadlines(): Promise<{ dueSoon: number; overdue: number; stalled: number }> {
      const rows = await worker().$queryRaw<
        Array<{ due_soon: number; overdue: number; stalled_closures: number }>
      >`SELECT due_soon, overdue, stalled_closures FROM app.privacy_request_deadlines()`;
      const dueSoon = rows[0]?.due_soon ?? 0;
      const overdue = rows[0]?.overdue ?? 0;
      const stalled = rows[0]?.stalled_closures ?? 0;
      logger.info('privacy.requests_due_soon', { count: dueSoon });
      if (overdue > 0) logger.warn('privacy.requests_overdue', { count: overdue });
      if (stalled > 0) logger.warn('privacy.closures_stalled', { count: stalled });
      return { dueSoon, overdue, stalled };
    },

    /**
     * Encerramento para quem se descobre menor (LEG-F04). Confirmação reforçada: senha atual e, com MFA, o 2º
     * fator. Abaixo do teto global (ADR-0020), a conta, os dados e os arquivos saem na hora; fica só a prova
     * mínima (pedido e AuditLog, sem e-mail; LEG-R03). Acima do teto (D4, ADR-0037), o acesso é cortado na hora
     * e o pedido fica pendente: a purga roda no job `privacy.account_purge_sweep`. Nos dois casos a pessoa sai
     * da conta; nunca recebe uma página de erro.
     */
    async closeMinorAccount(
      userId: string,
      password: string,
      mfaCode?: string,
    ): Promise<MinorClosureResult> {
      const proof = await deps.reauthenticate(userId, password, 'minor_closure', mfaCode);
      if (!proof) return 'invalid_password';
      const proofHash = sha(proof);
      const pending = await withUserOn(db, userId, async (tx) => {
        const rows = await tx.$queryRaw<Array<{ pending: boolean }>>`
          SELECT pending FROM app.account_close_minor(${proofHash})`;
        const deferred = rows[0]?.pending === true;
        // Arquivos de exportação ainda na transação (PR1b-B9): se o storage falhar, nada é confirmado. No
        // pendente, os arquivos saem na purga (os links já venceram).
        if (!deferred) await deps.eraseObjects(userId);
        return deferred;
      });
      // Sem userId: o log não liga uma conta a "é menor" (B5). A prova é o AuditLog. O pendente é o sinal de
      // abuso em massa a acompanhar (alerta na 7c).
      if (pending) {
        logger.warn('privacy.minor_closure_deferred');
        return 'pending';
      }
      logger.info('privacy.minor_account_closed');
      return 'closed';
    },

    /**
     * Aviso de exclusão das contas que não concluíram o onboarding (P7-M2, ADR-0037), no 23º dia: e-mail com a
     * data mínima da exclusão e o link para concluir ou sair. Marca o aviso só depois do envio; a exclusão
     * espera 7 dias depois do aviso. Log só com contagens.
     */
    async sendOnboardingExpiryNotices(limit = 500): Promise<number> {
      const due = await worker().$queryRaw<Array<{ user_id: string; purge_after: Date }>>`
        SELECT user_id, purge_after FROM app.onboarding_expiry_notices_due(${limit}::int)`;
      let sent = 0;
      for (const row of due) {
        const user = await withUserOn(worker(), row.user_id, (tx) =>
          tx.user.findFirst({
            where: { id: row.user_id, deletedAt: null, onboardingCompletedAt: null },
            select: { email: true },
          }),
        );
        if (!user) continue;
        const ok = await sendMail(user.email, 'onboarding-expiry-notice', {
          date: longDate.format(row.purge_after),
          url: `${deps.appUrl}/entrar`,
          exitUrl: `${deps.appUrl}/boas-vindas/encerrar-conta`,
        });
        if (!ok) continue;
        const marked = await withUserOn(
          worker(),
          row.user_id,
          (tx) =>
            tx.$queryRaw<Array<{ ok: boolean }>>`SELECT app.onboarding_expiry_notice_mark() AS ok`,
        );
        if (marked[0]?.ok === true) sent += 1;
      }
      logger.info('privacy.onboarding_expiry_notices', { count: sent });
      return sent;
    },

    /** Exclui as contas sem onboarding 30 dias após o cadastro e 7 dias após o aviso (P7-M2, ADR-0037). */
    async purgeExpiredOnboarding(limit = 500): Promise<number> {
      const rows = await worker().$queryRaw<Array<{ n: number }>>`
        SELECT app.onboarding_expired_purge(${limit}::int) AS n`;
      const n = rows[0]?.n ?? 0;
      logger.info('privacy.onboarding_expired_purged', { count: n });
      return n;
    },

    /** Registros de acesso além de ACCESS_LOG_RETENTION_DAYS (LEG-R02). */
    async purgeAccessLogs(): Promise<number> {
      const rows = await worker().$queryRaw<Array<{ n: number }>>`
        SELECT app.privacy_purge_access_logs(${deps.accessLogRetentionDays}::int) AS n`;
      const n = rows[0]?.n ?? 0;
      logger.info('privacy.access_logs_purged', { count: n });
      return n;
    },

    /** Provas além de PROOF_RETENTION_DAYS (LEG-R03, LEGAL-REVIEW OI-04). */
    async purgeProofs(): Promise<number> {
      const rows = await worker().$queryRaw<Array<{ n: number }>>`
        SELECT app.privacy_purge_proofs(${deps.proofRetentionDays}::int) AS n`;
      const n = rows[0]?.n ?? 0;
      logger.info('privacy.proofs_purged', { count: n });
      return n;
    },

    /** Provas de reautenticação vencidas ou já usadas, de todas as contas (PR1b-R2-B1, ADR-0035). */
    async purgeReauthProofs(): Promise<number> {
      const rows = await worker().$queryRaw<Array<{ n: number }>>`
        SELECT app.privacy_purge_reauth_proofs() AS n`;
      const n = rows[0]?.n ?? 0;
      logger.info('privacy.reauth_proofs_purged', { count: n });
      return n;
    },

    /** Contas com eliminação de dados de saúde vencida (rede de segurança do agendamento). */
    async dueHealthEliminations(limit = 500): Promise<string[]> {
      const rows = await worker().$queryRaw<Array<{ user_id: string }>>`
        SELECT user_id FROM app.privacy_due_health_eliminations(${limit}::int)`;
      return rows.map((r) => r.user_id);
    },
  };
}

export type PrivacyService = ReturnType<typeof createPrivacyService>;
