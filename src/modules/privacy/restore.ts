import { z } from 'zod';
import type { Db } from '@/lib/db/client';
import { withUserOn } from '@/lib/db/rls';
import type { Logger } from '@/lib/logger';
import type { HealthDataErasers } from './health-data';

/**
 * Reaplicação depois de restaurar um backup (P7-M3, ADR-0040; LEG-D04, LEG-F04, LEG-C04, LEG-R03, LEG-S07).
 *
 * O banco restaurado volta ao ponto do backup: contas excluídas, encerradas como menor, expiradas ou nunca
 * verificadas reaparecem, consentimentos revogados voltam "ativos" e dados de saúde eliminados voltam. O
 * **livro** (`app.restore_ledger`, lido no banco de origem ou num arquivo `pnpm backup:ledger`) diz o que mudou
 * depois do backup; aqui ele é aplicado, ANTES de liberar o acesso:
 * 1. provas da origem copiadas (revogações, pedidos, AuditLog, aceites, registros de acesso);
 * 2. contas que não existem mais na origem: as não verificadas saem; as outras têm o acesso cortado e passam
 *    pela purga normal (`app.account_purge`, eliminadores de todas as tabelas de saúde);
 * 3. dados de saúde eliminados na origem saem de novo (eliminadores, sem olhar o consentimento atual: tudo o
 *    que o backup tem é anterior à eliminação);
 * 4. provas copiadas de novo (a purga mexe no pedido; a origem prevalece);
 * 5. sempre, com ou sem livro: sessões, tokens e provas de reautenticação zerados, links de exportação vencidos,
 *    expurgo de autenticação e AuditLog `restore_reapplied`.
 * Sem livro (origem perdida), só o passo 5: o que mudou entre o backup e o incidente se perde (residual
 * documentado em BACKUP_RESTORE.md; mitigação: recuperação a um ponto no tempo e `backup:ledger` fora do banco).
 * As funções `app.restore_*` são só do dono (app_migrator); a purga e os eliminadores rodam no app_worker, com
 * RLS por pessoa. O banco recusa (revisão A1/A2 da 7e): livro de outra instalação, livro lido antes dos dados
 * restaurados, livro que começa depois do ponto e qualquer passo depois de o acesso ser liberado (sessão nova
 * depois desta reaplicação). Idempotente até a liberação. Log e resumo só com contagens.
 */
export interface SqlClient {
  query<R extends object>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

/**
 * Margem do livro antes do ponto do backup (revisão M1): uma transação em curso no instante do snapshot grava
 * datas anteriores a ele (`now()` é o início da transação) e ficaria fora do backup e do livro.
 */
export const LEDGER_MARGIN_MS = 60 * 60 * 1000;

const row = z.record(z.string(), z.unknown());
export const restoreLedgerSchema = z.object({
  version: z.literal(1),
  installation: z.uuid(),
  since: z.string(),
  readAt: z.string(),
  users: z.array(
    z.object({
      id: z.uuid(),
      deleted_at: z.string().nullable(),
      health_data_purge_at: z.string().nullable(),
    }),
  ),
  consent_records: z.array(row),
  policy_acceptances: z.array(row),
  privacy_requests: z.array(row),
  audit_logs: z.array(row),
  access_logs: z.array(row),
});
export type RestoreLedger = z.infer<typeof restoreLedgerSchema>;

export interface RestorePlan {
  users: number;
  unverified: number;
  closures: number;
  health: number;
}

export interface RestoreSummary {
  /** Purgas que não concluíram (rodar de novo; o comando sai com erro). */
  failed: number;
  proofsCopied: number;
  unverifiedRemoved: number;
  accountsPurged: number;
  healthEliminated: number;
  sessionsRevoked: number;
  exportsExpired: number;
}

/** Lê o livro no banco de ORIGEM (papel app_backup), num snapshot só, com a margem antes do ponto. */
export async function readRestoreLedger(client: SqlClient, since: Date): Promise<RestoreLedger> {
  const { rows } = await client.query<{ ledger: unknown }>(
    'SELECT app.restore_ledger($1::timestamptz) AS ledger',
    [new Date(since.getTime() - LEDGER_MARGIN_MS).toISOString()],
  );
  return restoreLedgerSchema.parse(rows[0]?.ledger);
}

export function createRestoreReapplier(deps: {
  /** app_migrator do banco RESTAURADO. */
  owner: SqlClient;
  /** app_worker do banco RESTAURADO. */
  worker: Db;
  erasers: HealthDataErasers;
  logger: Logger;
}) {
  const erasers = Object.values(deps.erasers);
  if (erasers.length === 0) throw new Error('nenhum eliminador de dados de saúde');

  async function applyProofs(ledger: string, since: string): Promise<number> {
    const { rows } = await deps.owner.query<{ n: number }>(
      'SELECT app.restore_apply_proofs($1::jsonb, $2::timestamptz) AS n',
      [ledger, since],
    );
    return rows[0]?.n ?? 0;
  }

  /** Mesma purga do job `privacy.account_purge`, sem o storage (fora do backup; a varredura de órfãos cuida). */
  async function purge(userId: string): Promise<boolean> {
    return withUserOn(deps.worker, userId, async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM public.users WHERE id = ${userId}::uuid FOR UPDATE`;
      for (const eraser of erasers) await eraser(tx);
      const done = await tx.$queryRaw<Array<{ ok: boolean }>>`SELECT app.account_purge() AS ok`;
      return done[0]?.ok === true;
    });
  }

  async function eliminate(userId: string): Promise<void> {
    await withUserOn(deps.worker, userId, async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM public.users WHERE id = ${userId}::uuid FOR UPDATE`;
      for (const eraser of erasers) await eraser(tx);
    });
  }

  /**
   * Fixa o ponto deste restore antes de tudo (segunda revisão, N1/N2): na primeira vez, recusa ponto anterior aos
   * dados restaurados; depois, ponto diferente do primeiro; e sempre, acesso já liberado.
   */
  async function begin(since: Date): Promise<void> {
    await deps.owner.query('SELECT app.restore_begin($1::timestamptz)', [since.toISOString()]);
  }

  return {
    /** Simulação: só contagens do que a reaplicação faria; não muda dados (só fixa o ponto deste restore). */
    async plan(ledger: RestoreLedger, since: Date): Promise<RestorePlan> {
      await begin(since);
      const { rows } = await deps.owner.query<{ plan: RestorePlan }>(
        'SELECT app.restore_plan($1::jsonb, $2::timestamptz) AS plan',
        [JSON.stringify(restoreLedgerSchema.parse(ledger)), since.toISOString()],
      );
      const plan = rows[0]?.plan;
      if (!plan) throw new Error('plano vazio');
      return plan;
    },

    /** `since`: o ponto do backup restaurado (sem a margem). */
    async reapply(ledger: RestoreLedger | null, since: Date): Promise<RestoreSummary> {
      const at = since.toISOString();
      await begin(since);
      const summary: RestoreSummary = {
        failed: 0,
        proofsCopied: 0,
        unverifiedRemoved: 0,
        accountsPurged: 0,
        healthEliminated: 0,
        sessionsRevoked: 0,
        exportsExpired: 0,
      };
      if (ledger) {
        const json = JSON.stringify(restoreLedgerSchema.parse(ledger));
        summary.proofsCopied = await applyProofs(json, at);
        const { rows } = await deps.owner.query<{ subject: string; step: string }>(
          'SELECT subject, step FROM app.restore_reapply($1::jsonb, $2::timestamptz)',
          [json, at],
        );
        for (const r of rows) {
          if (r.step === 'unverified_removed') summary.unverifiedRemoved += 1;
          else if (r.step === 'closure') {
            if (await purge(r.subject)) summary.accountsPurged += 1;
            else summary.failed += 1;
          } else if (r.step === 'health_eliminate') {
            await eliminate(r.subject);
            summary.healthEliminated += 1;
          }
        }
        await applyProofs(json, at);
      }
      const { rows } = await deps.owner.query<{ out: { sessions: number; exports: number } }>(
        'SELECT app.restore_reset_access($1::timestamptz) AS out',
        [at],
      );
      summary.sessionsRevoked = rows[0]?.out.sessions ?? 0;
      summary.exportsExpired = rows[0]?.out.exports ?? 0;
      deps.logger.info('backup.reapplied', { count: summary.accountsPurged });
      if (summary.failed > 0) deps.logger.warn('backup.reapply_failed', { count: summary.failed });
      return summary;
    },
  };
}
