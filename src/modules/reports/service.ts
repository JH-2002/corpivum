import type { JobQueue } from '@/adapters/jobs/types';
import type { KmsProvider } from '@/adapters/kms/types';
import type { StorageProvider } from '@/adapters/storage/types';
import { decryptField, encryptField } from '@/lib/crypto/field';
import { auditAppend } from '@/lib/db/audit';
import type { Db } from '@/lib/db/client';
import { withUserOn, type Tx } from '@/lib/db/rls';
import { ConsentRequiredError } from '@/lib/errors';
import type { Logger } from '@/lib/logger';
import type { DateRange } from '@/lib/period';
import { withConsentOn } from '@/modules/consent/guard';
import type { HealthDataSource } from '@/modules/health/source';
import { exportTables, type AccountExport, type ExportTableName } from './dataset';
import { fullExportJson, fullExportZip } from './export';
import { calendarRange, isValidReference, type ReportPeriod } from './period';
import { buildReport, type ReportModel } from './report';
import { EXPORT_FILE_FIELD, EXPORTS_ROOT, exportKey, parseExportKey } from './storage';
import { exportRecordsFromRows } from './export-rows';
import { createFieldCipher } from '@/modules/health/core';

/**
 * Exportação completa e relatórios em arquivo (LEG-D03, §29, ADR-0032).
 *
 * - Pedido com consentimento `health_data` ativo (guard + RLS), trava por pessoa, no máximo um em andamento e
 *   `MAX_PER_DAY` em 24 h. Gera em segundo plano (`reports.generate`, payload só com IDs).
 * - Arquivo cifrado (envelope, contexto da pessoa + `data_export_jobs.file`) no StorageProvider, nunca público.
 * - Download só pela rota autenticada, com consentimento, até `expires_at` (teto de 24 h, relógio do banco).
 * - AuditLog no pedido, no download e ao apagar (LEG-S06). Logs só com IDs (LEG-R04).
 */
export const EXPORT_JOB = 'reports.generate';
export const MAX_PER_DAY = 5;
export const MAX_LINK_HOURS = 24;

export type ExportKind = 'full_export' | 'report';
export type ExportFormat = 'json' | 'csv' | 'pdf';
export type ExportStatus = 'queued' | 'processing' | 'ready' | 'failed' | 'expired';

export type ExportRequest =
  | { kind: 'full_export'; format: 'json' | 'csv' }
  | {
      kind: 'report';
      format: ExportFormat;
      period: ReportPeriod;
      reference: string;
      hideBodyValues: boolean;
    };

export type RequestOutcome =
  | { status: 'queued'; jobId: string }
  | { status: 'busy' | 'limit' | 'no_consent' | 'demo' | 'invalid' };

export interface ExportJobSummary {
  id: string;
  kind: ExportKind;
  format: ExportFormat;
  reportPeriod: ReportPeriod | null;
  range: DateRange | null;
  hideBodyValues: boolean;
  status: ExportStatus;
  expiresAt: string | null;
  createdAt: string;
  /** Pronto e dentro do prazo agora (o vencido ainda não limpo pelo job aparece como expirado, revisão B4). */
  downloadable: boolean;
}

export interface ExportFile {
  filename: string;
  contentType: string;
  body: Uint8Array<ArrayBuffer>;
}

/** Arquivos que dependem do texto (i18n): injetados pela camada do Next (`./server`). */
export interface ReportRenderers {
  notice(today: string): string;
  reportPdf(model: ReportModel, today: string): Promise<Uint8Array<ArrayBuffer>>;
  reportJson(model: ReportModel, today: string): Uint8Array<ArrayBuffer>;
  reportCsv(model: ReportModel, today: string): Uint8Array<ArrayBuffer>;
}

export interface ReportsDeps {
  db: Db;
  kms: KmsProvider;
  storage: StorageProvider;
  queue: Pick<JobQueue, 'enqueue'>;
  logger: Logger;
  /** Fonte dos dados de saúde da pessoa (consentimento + RLS). */
  sourceFor(userId: string): HealthDataSource;
  render: ReportRenderers;
  linkHours: number;
  timeZone: string;
  today(): string;
  /** Client dos jobs (`app_worker`, ADR-0037): a varredura de arquivos vencidos só roda nesse papel. */
  workerDb?: () => Db;
}

const CONTENT_TYPE: Record<ExportFormat, string> = {
  json: 'application/json; charset=utf-8',
  csv: 'application/zip',
  pdf: 'application/pdf',
};
const EXTENSION: Record<ExportFormat, string> = { json: 'json', csv: 'zip', pdf: 'pdf' };

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function exportFilename(job: {
  kind: ExportKind;
  format: ExportFormat;
  reportPeriod: ReportPeriod | null;
  range: DateRange | null;
  createdAt: string;
}): string {
  const ext = EXTENSION[job.format];
  if (job.kind === 'report' && job.range && job.reportPeriod) {
    return `healthmind360-relatorio-${job.reportPeriod}-${job.range.from}.${ext}`;
  }
  return `healthmind360-exportacao-${job.createdAt.slice(0, 10)}.${ext}`;
}

type JobRow = {
  id: string;
  kind: ExportKind;
  format: ExportFormat;
  reportPeriod: ReportPeriod | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  hideBodyValues: boolean;
  status: ExportStatus;
  expiresAt: Date | null;
  createdAt: Date;
};

function summary(row: JobRow, now: Date = new Date()): ExportJobSummary {
  return {
    downloadable: row.status === 'ready' && row.expiresAt !== null && row.expiresAt > now,
    id: row.id,
    kind: row.kind,
    format: row.format,
    reportPeriod: row.reportPeriod,
    range:
      row.periodStart && row.periodEnd
        ? { from: iso(row.periodStart), to: iso(row.periodEnd) }
        : null,
    hideBodyValues: row.hideBodyValues,
    status: row.status,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const JOB_SELECT = {
  id: true,
  kind: true,
  format: true,
  reportPeriod: true,
  periodStart: true,
  periodEnd: true,
  hideBodyValues: true,
  status: true,
  expiresAt: true,
  createdAt: true,
} as const;

async function accountExport(tx: Tx, userId: string): Promise<AccountExport> {
  const [user, consents, documents, requests] = await Promise.all([
    tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        email: true,
        createdAt: true,
        emailVerifiedAt: true,
        mfaEnabledAt: true,
        dataMode: true,
        streaksEnabled: true,
        calorieEstimateEnabled: true,
        remindHabits: true,
        remindDailyLog: true,
        quietStartMin: true,
        quietEndMin: true,
      },
    }),
    tx.consentRecord.findMany({
      orderBy: { grantedAt: 'asc' },
      select: {
        purpose: true,
        grantedAt: true,
        revokedAt: true,
        policyVersion: { select: { version: true } },
      },
    }),
    tx.policyAcceptance.findMany({
      orderBy: { acceptedAt: 'asc' },
      select: {
        kind: true,
        acceptedAt: true,
        policyVersion: { select: { document: true, version: true } },
      },
    }),
    tx.privacyRequest.findMany({
      orderBy: { createdAt: 'asc' },
      select: { kind: true, status: true, createdAt: true, dueAt: true, closedAt: true },
    }),
  ]);
  return {
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    mfaEnabled: user.mfaEnabledAt !== null,
    dataMode: user.dataMode,
    preferences: {
      streaksEnabled: user.streaksEnabled,
      calorieEstimateEnabled: user.calorieEstimateEnabled,
      remindHabits: user.remindHabits,
      remindDailyLog: user.remindDailyLog,
      quietStartMin: user.quietStartMin,
      quietEndMin: user.quietEndMin,
    },
    consents: consents.map((c) => ({
      purpose: c.purpose,
      policyVersion: c.policyVersion.version,
      grantedAt: c.grantedAt.toISOString(),
      revokedAt: c.revokedAt?.toISOString() ?? null,
    })),
    documents: documents.map((d) => ({
      document: d.policyVersion.document,
      version: d.policyVersion.version,
      kind: d.kind,
      at: d.acceptedAt.toISOString(),
    })),
    privacyRequests: requests.map((r) => ({
      kind: r.kind,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      dueAt: r.dueAt.toISOString(),
      closedAt: r.closedAt?.toISOString() ?? null,
    })),
  };
}

export function createReportsService(deps: ReportsDeps) {
  const { db, logger } = deps;
  if (deps.linkHours < 1 || deps.linkHours > MAX_LINK_HOURS) {
    throw new Error('linkHours fora de 1–24 (LEG-D03)');
  }

  /**
   * Exportação completa (OI-32, opção b): consentimento ativo OU carência até a eliminação (direito do titular,
   * art. 18). As políticas de `data_export_jobs` aplicam a mesma regra no banco, só para exportação completa.
   */
  async function withExportAccess<T>(
    userId: string,
    fn: (tx: Tx) => Promise<T>,
  ): Promise<T | null> {
    return withUserOn(db, userId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ ok: boolean }>>`
        SELECT (app.has_active_consent('health_data') OR app.health_grace_active()) AS ok`;
      return rows[0]?.ok === true ? fn(tx) : null;
    });
  }

  async function withConsent<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T | null> {
    try {
      return await withConsentOn(db, userId, 'health_data', fn);
    } catch (error) {
      if (error instanceof ConsentRequiredError) return null;
      throw error;
    }
  }

  /** Apaga o arquivo e marca a linha. Falha no storage: a linha continua pendente e o job tenta de novo. */
  /** Onde a última varredura de órfãos parou (em memória: depois de reiniciar, começa do início). */
  let orphanCursor: string | undefined;

  async function cleanupOne(userId: string, jobId: string): Promise<boolean> {
    try {
      await deps.storage.delete(exportKey(userId, jobId));
    } catch {
      logger.warn('reports.file_delete_failed', { jobId });
      return false;
    }
    // No contexto da pessoa: a função só marca exportação dela (revisão B5 da 7b).
    const marked = await withUserOn(
      db,
      userId,
      (tx) => tx.$queryRaw<Array<{ ok: boolean }>>`
        SELECT app.exports_mark_file_deleted(${jobId}::uuid) AS ok`,
    );
    return marked[0]?.ok === true;
  }

  async function buildFile(userId: string, job: JobRow): Promise<Uint8Array<ArrayBuffer>> {
    const today = deps.today();
    if (job.kind === 'full_export') {
      // Caminho restrito da exportação (OI-32): a função do banco só lê com este pedido em geração, com
      // consentimento ativo ou na carência até a eliminação, e grava o AuditLog. As telas não passam por aqui.
      const { raw, account } = await withUserOn(db, userId, async (tx) => {
        const rows = await tx.$queryRaw<Array<{ data: unknown }>>`
          SELECT app.export_job_health_data(${job.id}::uuid) AS data`;
        return { raw: rows[0]?.data, account: await accountExport(tx, userId) };
      });
      const records = await exportRecordsFromRows(raw, {
        userId,
        cipher: createFieldCipher(deps.kms),
        timeZone: deps.timeZone,
      });
      const input = {
        generatedAt: new Date(),
        timeZone: deps.timeZone,
        notice: deps.render.notice(today),
        account,
        tables: exportTables(records),
      };
      return job.format === 'csv' ? fullExportZip(input) : fullExportJson(input);
    }
    if (!job.reportPeriod || !job.periodStart || !job.periodEnd)
      throw new Error('relatório sem período');
    const model = await buildReport(deps.sourceFor(userId), {
      period: job.reportPeriod,
      range: { from: iso(job.periodStart), to: iso(job.periodEnd) },
      today,
      hideBodyValues: job.hideBodyValues,
    });
    if (job.format === 'pdf') return deps.render.reportPdf(model, today);
    return job.format === 'csv'
      ? deps.render.reportCsv(model, today)
      : deps.render.reportJson(model, today);
  }

  return {
    async request(userId: string, input: ExportRequest): Promise<RequestOutcome> {
      let range: DateRange | null = null;
      if (input.kind === 'report') {
        const today = deps.today();
        if (!isValidReference(input.reference, today)) return { status: 'invalid' };
        range = calendarRange(input.period, input.reference, today);
      }
      const outcome = await (input.kind === 'full_export' ? withExportAccess : withConsent)(
        userId,
        async (tx): Promise<RequestOutcome> => {
          // Serializa os pedidos da pessoa: a contagem e a criação valem juntas (sem corrida).
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('reports.request'), hashtext(${userId}))`;
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { dataMode: true },
          });
          if (user?.dataMode !== 'own') return { status: 'demo' };
          const active = await tx.dataExportJob.count({
            where: { status: { in: ['queued', 'processing'] } },
          });
          if (active > 0) return { status: 'busy' };
          const recent = await tx.$queryRaw<Array<{ n: number }>>`
          SELECT count(*)::int AS n FROM public.data_export_jobs
           WHERE created_at > now() - interval '24 hours'`;
          if ((recent[0]?.n ?? 0) >= MAX_PER_DAY) return { status: 'limit' };
          const job = await tx.dataExportJob.create({
            data: {
              userId,
              kind: input.kind,
              format: input.format,
              ...(input.kind === 'report' && range
                ? {
                    reportPeriod: input.period,
                    periodStart: new Date(`${range.from}T00:00:00Z`),
                    periodEnd: new Date(`${range.to}T00:00:00Z`),
                    hideBodyValues: input.hideBodyValues,
                  }
                : {}),
            },
            select: { id: true },
          });
          await auditAppend(tx, 'data_export_requested', 'data_export', job.id);
          return { status: 'queued', jobId: job.id };
        },
      );
      if (!outcome) return { status: 'no_consent' };
      if (outcome.status === 'queued') {
        await deps.queue.enqueue(
          EXPORT_JOB,
          { userId, jobId: outcome.jobId },
          { singletonKey: `export:${outcome.jobId}`, maxAttempts: 2 },
        );
        // Sem userId: o log não liga a conta a um evento de dado de saúde (N2; o vínculo fica no AuditLog).
        logger.info('reports.requested', { jobId: outcome.jobId });
      }
      return outcome;
    },

    /**
     * Quantidade de registros por categoria (seção "Seus dados", LEG-D01). Só contagens, sem conteúdo; sem
     * consentimento ativo, `null` (os dados ficam bloqueados).
     */
    async dataSummary(userId: string): Promise<Record<ExportTableName, number> | null> {
      return withConsent(userId, async (tx) => {
        const [sleep, habits, checks, body, meals, water, activities, sets, goals, reminders] =
          await Promise.all([
            tx.sleepEntry.count(),
            tx.habit.count(),
            tx.habitCheck.count(),
            tx.bodyMeasurement.count(),
            tx.mealEntry.count(),
            tx.waterEntry.count(),
            tx.activityEntry.count(),
            tx.strengthSet.count(),
            tx.goal.count(),
            tx.reminder.count(),
          ]);
        return {
          sleep,
          habits,
          habit_checks: checks,
          body_measurements: body,
          meals,
          water,
          activities,
          strength_sets: sets,
          goals,
          reminders,
        };
      });
    },

    /** Pedidos das últimas 24 h (os vencidos somem da lista). Sem consentimento: lista vazia. */
    async list(userId: string): Promise<ExportJobSummary[]> {
      const rows = await withExportAccess(userId, (tx) =>
        tx.dataExportJob.findMany({
          where: {
            createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            fileDeletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
          select: JOB_SELECT,
        }),
      );
      return (rows ?? []).map((row) => summary(row));
    },

    /** Executado pelo job. Rechecha consentimento e estado em cada passo; nada de conteúdo em log. */
    async generate(userId: string, jobId: string): Promise<'ready' | 'skipped'> {
      const job = await withExportAccess(userId, async (tx) => {
        const claimed = await tx.dataExportJob.updateMany({
          where: { id: jobId, status: 'queued' },
          data: { status: 'processing' },
        });
        if (claimed.count === 0) return null;
        return tx.dataExportJob.findUnique({ where: { id: jobId }, select: JOB_SELECT });
      });
      if (!job) return 'skipped';

      const key = exportKey(userId, jobId);
      try {
        const plain = await buildFile(userId, job);
        const sealed = await encryptField(deps.kms, { userId, ...EXPORT_FILE_FIELD }, plain);
        plain.fill(0);
        await deps.storage.put(key, sealed, { contentType: 'application/octet-stream' });
        const done = await withExportAccess(userId, async (tx) => {
          // Serializa com a eliminação (que trava a mesma linha FOR UPDATE, revisão M1 do OI-32): se ela
          // terminou antes, o pedido já não existe e o arquivo é descartado logo abaixo.
          await tx.$queryRaw`SELECT 1 FROM public.users WHERE id = ${userId}::uuid FOR SHARE`;
          const n = await tx.$executeRaw`UPDATE public.data_export_jobs
             SET status = 'ready', size_bytes = ${sealed.byteLength},
                 expires_at = now() + make_interval(hours => ${deps.linkHours}::int), updated_at = now()
           WHERE id = ${jobId}::uuid AND status = 'processing' AND file_deleted_at IS NULL`;
          // Portabilidade (LEG-D07, ADR-0034): a cópia completa pronta conclui o pedido aberto, junto.
          if (n > 0 && job.kind === 'full_export') {
            await tx.$queryRaw`SELECT app.privacy_requests_close_portability()`;
          }
          return n;
        });
        if (!done) {
          // Consentimento revogado (ou pedido apagado) durante a geração: o arquivo não fica.
          await deps.storage.delete(key);
          return 'skipped';
        }
        logger.info('reports.ready', { jobId });
        return 'ready';
      } catch (error) {
        await deps.storage.delete(key).catch(() => undefined);
        await withExportAccess(userId, (tx) =>
          tx.dataExportJob.updateMany({
            where: { id: jobId, status: 'processing' },
            data: { status: 'failed' },
          }),
        ).catch(() => undefined);
        logger.warn('reports.generate_failed', { jobId, errorCode: 'generate' });
        throw error;
      }
    },

    /** Arquivo para a rota de download: dono, consentimento, pronto e dentro do prazo (relógio do banco). */
    async download(userId: string, jobId: string): Promise<ExportFile | null> {
      const job = await withExportAccess(userId, async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM public.data_export_jobs
           WHERE id = ${jobId}::uuid AND status = 'ready' AND expires_at > now()`;
        if (rows.length === 0) return null;
        const row = await tx.dataExportJob.findUnique({ where: { id: jobId }, select: JOB_SELECT });
        if (row) await auditAppend(tx, 'data_export_downloaded', 'data_export', jobId);
        return row;
      });
      if (!job) return null;
      let stored: Uint8Array;
      try {
        stored = (await deps.storage.get(exportKey(userId, jobId))).body;
      } catch {
        return null;
      }
      const body = await decryptField(deps.kms, { userId, ...EXPORT_FILE_FIELD }, stored);
      const s = summary(job);
      return {
        filename: exportFilename(s),
        contentType: CONTENT_TYPE[job.format],
        body: new Uint8Array(body),
      };
    },

    /** A pessoa apaga um arquivo antes do prazo. DELETE só pelo dono (não depende do consentimento). */
    /**
     * A pessoa apaga um arquivo antes do prazo. O link vence na hora (a linha fica, para o limite diário, e sai
     * em 2 dias); o arquivo é apagado em seguida e, se o storage falhar, o job `reports.expire` tenta de novo
     * (revisão M1/B3). Sem consentimento, os links já venceram na revogação.
     */
    async remove(userId: string, jobId: string): Promise<boolean> {
      const removed = await withExportAccess(userId, async (tx) => {
        const n = await tx.$executeRaw`UPDATE public.data_export_jobs
           SET status = 'expired', expires_at = least(coalesce(expires_at, now()), now()), updated_at = now()
         WHERE id = ${jobId}::uuid AND file_deleted_at IS NULL`;
        if (n > 0) await auditAppend(tx, 'data_export_deleted', 'data_export', jobId);
        return n > 0;
      });
      if (!removed) return false;
      await cleanupOne(userId, jobId);
      return true;
    },

    /**
     * Job de hora em hora (revisão A2/B5): apaga do storage os arquivos vencidos, expirados ou de pedidos parados
     * e SÓ ENTÃO marca a linha; falha num arquivo não interrompe os outros e volta na próxima execução. Depois,
     * remove as linhas cujo arquivo saiu há mais de 2 dias. Sem contexto de usuário, só IDs.
     */
    async expireDue(limit = 500): Promise<number> {
      const worker = deps.workerDb?.() ?? db;
      const rows = await worker.$queryRaw<Array<{ id: string; user_id: string }>>`
        SELECT id, user_id FROM app.exports_cleanup_due(${limit}::int)`;
      let done = 0;
      for (const r of rows) if (await cleanupOne(r.user_id, r.id)) done += 1;
      const purged = await worker.$queryRaw<
        Array<{ n: number }>
      >`SELECT app.exports_purge_rows() AS n`;
      const rowsPurged = purged[0]?.n ?? 0;
      if (done > 0) logger.info('reports.expired', { count: done });
      if (rowsPurged > 0) logger.info('reports.rows_purged', { count: rowsPurged });
      return done;
    },

    /**
     * Arquivos órfãos no storage (OI-35): lista o prefixo `exports/` e apaga os arquivos que nenhum pedido com
     * arquivo vivo reconhece (`app.exports_orphans`, só no app_worker), como o de uma geração que terminou depois
     * da purga da conta. Chave fora do formato não é apagada: só contada no log. Até `limit` chaves por execução,
     * continuando de onde a anterior parou (revisão B5 da 7e: com muitos arquivos vivos, os do fim da lista também
     * são vistos); a regra de ciclo de vida do provedor (`infra/retention.json`) é a rede de segurança.
     */
    async sweepOrphans(limit = 1000): Promise<number> {
      const worker = deps.workerDb?.() ?? db;
      const keys = await deps.storage.list(EXPORTS_ROOT, limit, orphanCursor);
      orphanCursor = keys.length < limit ? undefined : keys.at(-1);
      const parsed = keys.map(parseExportKey);
      const known = parsed.filter((k) => k !== null);
      const unknown = parsed.length - known.length;
      if (unknown > 0) logger.warn('reports.orphans_unknown', { count: unknown });
      if (known.length === 0) return 0;
      const orphans = await worker.$queryRaw<Array<{ user_id: string; job_id: string }>>`
        SELECT user_id, job_id FROM app.exports_orphans(
          ${known.map((k) => k.userId)}::uuid[], ${known.map((k) => k.jobId)}::uuid[])`;
      let removed = 0;
      for (const o of orphans) {
        try {
          await deps.storage.delete(exportKey(o.user_id, o.job_id));
          removed += 1;
        } catch {
          // Fica para a próxima execução.
        }
      }
      if (removed > 0) logger.info('reports.orphans_removed', { count: removed });
      return removed;
    },
  };
}

export type ReportsService = ReturnType<typeof createReportsService>;
