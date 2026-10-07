import { getAdapters } from '@/adapters';
import { MemoryJobQueue } from '@/adapters/jobs/memory';
import { PgJobQueue } from '@/adapters/jobs/postgres';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { registerAuthJobs, scheduleAuthPurge } from '@/modules/auth/jobs';
import { getAuthService } from '@/modules/auth/server';
import { registerPrivacyJobs, schedulePrivacyJobs } from '@/modules/privacy/jobs';
import { getHealthDataEliminator, getPrivacyService } from '@/modules/privacy/server';

const MEMORY_DRAIN_MS = 60 * 1000;

/**
 * Registra e agenda os jobs recorrentes e liga o consumo da fila nesta instância.
 * - Fila em memória (dev/test): laço local.
 * - Fila Postgres (ADR-0019, OI-14): `JOB_WORKER=inline` consome aqui; `off` deixa para um worker separado.
 *   Os agendamentos usam `singletonKey`, então várias instâncias não duplicam jobs recorrentes.
 */
export async function startJobs(): Promise<void> {
  const { jobs } = getAdapters();
  registerAuthJobs(jobs, getAuthService());
  registerPrivacyJobs(jobs, {
    service: getPrivacyService(),
    eliminator: getHealthDataEliminator(),
  });
  await scheduleAuthPurge(jobs);
  await schedulePrivacyJobs(jobs);
  if (jobs instanceof MemoryJobQueue) {
    void jobs.drain().catch(() => logger.warn('job.drain_failed', { adapter: jobs.id }));
    const timer = setInterval(() => {
      jobs.drain().catch(() => logger.warn('job.drain_failed', { adapter: jobs.id }));
    }, MEMORY_DRAIN_MS);
    timer.unref();
  } else if (jobs instanceof PgJobQueue && getEnv().JOB_WORKER === 'inline') {
    jobs.start();
  }
  logger.info('jobs.registered', { adapter: jobs.id });
}
