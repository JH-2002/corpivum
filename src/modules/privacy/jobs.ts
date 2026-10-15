import { z } from 'zod';
import type { JobQueue } from '@/adapters/jobs/types';
import { HEALTH_ELIMINATION_JOB, healthEliminationKey } from '@/modules/consent';
import type { createHealthDataEliminator } from './health-data';
import { ACCOUNT_PURGE_JOB, accountPurgeKey, type PrivacyService } from './service';

/**
 * Jobs da Central de Privacidade (ADR-0019). Payloads só com IDs (LEG-R04).
 * - `privacy.health_data_eliminate` ({ userId }): eliminação agendada na revogação; rechecada na execução.
 * - `privacy.purge_access_logs` (diário): AccessLog além de ACCESS_LOG_RETENTION_DAYS (LEG-R02).
 * - `privacy.purge_proofs` (diário): provas além de PROOF_RETENTION_DAYS (LEG-R03, LEGAL-REVIEW).
 * - `privacy.health_data_sweep` (diário): reagenda eliminações vencidas cujo job se perdeu.
 * - `privacy.account_purge` ({ userId }): purga da conta excluída, logo depois da exclusão (ADR-0034).
 * - `privacy.account_purge_sweep` (diário): reenfileira a purga de contas excluídas que ainda existem.
 * - `privacy.request_deadlines` (diário): só a contagem de pedidos que vencem em até 3 dias e dos vencidos.
 * Os recorrentes usam `singletonKey` e se reagendam ao terminar, mesmo após falha.
 */
export const PRIVACY_DAILY_MS = 24 * 60 * 60 * 1000;
export const PRIVACY_RECURRING_JOBS = [
  'privacy.purge_access_logs',
  'privacy.purge_proofs',
  'privacy.health_data_sweep',
  'privacy.account_purge_sweep',
  'privacy.request_deadlines',
] as const;
type RecurringJob = (typeof PRIVACY_RECURRING_JOBS)[number];

const userPayload = z.object({ userId: z.uuid() });

export function registerPrivacyJobs(
  queue: JobQueue,
  deps: {
    service: Pick<
      PrivacyService,
      | 'purgeAccessLogs'
      | 'purgeProofs'
      | 'dueHealthEliminations'
      | 'purgeAccount'
      | 'duePurges'
      | 'requestDeadlines'
    >;
    eliminator: ReturnType<typeof createHealthDataEliminator>;
  },
  now: () => Date = () => new Date(),
): void {
  queue.register(HEALTH_ELIMINATION_JOB, async (payload) => {
    const { userId } = userPayload.parse(payload);
    await deps.eliminator.eliminate(userId);
  });
  queue.register(ACCOUNT_PURGE_JOB, async (payload) => {
    const { userId } = userPayload.parse(payload);
    await deps.service.purgeAccount(userId);
  });

  const tasks: Record<RecurringJob, () => Promise<unknown>> = {
    'privacy.purge_access_logs': () => deps.service.purgeAccessLogs(),
    'privacy.purge_proofs': () => deps.service.purgeProofs(),
    'privacy.health_data_sweep': async () => {
      for (const userId of await deps.service.dueHealthEliminations()) {
        await queue.enqueue(
          HEALTH_ELIMINATION_JOB,
          { userId },
          { singletonKey: healthEliminationKey(userId) },
        );
      }
    },
    'privacy.account_purge_sweep': async () => {
      for (const userId of await deps.service.duePurges()) {
        await queue.enqueue(
          ACCOUNT_PURGE_JOB,
          { userId },
          { singletonKey: accountPurgeKey(userId) },
        );
      }
    },
    'privacy.request_deadlines': () => deps.service.requestDeadlines(),
  };
  for (const name of PRIVACY_RECURRING_JOBS) {
    queue.register(name, async () => {
      try {
        await tasks[name]();
      } finally {
        await queue.enqueue(
          name,
          {},
          { runAt: new Date(now().getTime() + PRIVACY_DAILY_MS), singletonKey: name },
        );
      }
    });
  }
}

/** Primeira execução de cada job recorrente (na subida do servidor), sem duplicar entre instâncias. */
export async function schedulePrivacyJobs(queue: JobQueue, now: Date = new Date()): Promise<void> {
  for (const name of PRIVACY_RECURRING_JOBS) {
    await queue.enqueue(name, {}, { runAt: now, singletonKey: name });
  }
}
