import { getAdapters } from '@/adapters';
import { MemoryJobQueue } from '@/adapters/jobs/memory';
import { PgJobQueue } from '@/adapters/jobs/postgres';
import { APP_TIME_ZONE } from '@/lib/dates';
import { getWorkerDb } from '@/lib/db/client';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { assertRetentionPolicy } from '@/lib/retention';
import { registerAuthJobs, scheduleAuthPurge } from '@/modules/auth/jobs';
import { getAuthService } from '@/modules/auth/server';
import { getHealthServices } from '@/modules/health/server';
import {
  activeRemindersFrom,
  registerReminderJobs,
  scheduleReminderJobs,
} from '@/modules/notifications/jobs';
import {
  createVolumeMonitor,
  registerObservabilityJobs,
  scheduleObservabilityJobs,
} from '@/modules/observability';
import { registerPrivacyJobs, schedulePrivacyJobs } from '@/modules/privacy/jobs';
import { getHealthDataEliminator, getPrivacyService } from '@/modules/privacy/server';
import { registerReportJobs, scheduleReportJobs } from '@/modules/reports/jobs';
import { getReportsService } from '@/modules/reports/server';

const MEMORY_DRAIN_MS = 60 * 1000;

/**
 * Registra e agenda os jobs recorrentes e liga o consumo da fila nesta instância. Antes, confere a política de
 * retenção (`assertRetentionPolicy`): backups ≤ PURGE_DAYS, link ≤ 24 h, AccessLog ≤ 180 dias.
 * - Fila em memória (dev/test): laço local.
 * - Fila Postgres (ADR-0019, OI-14): `JOB_WORKER=inline` consome aqui; `off` deixa para um worker separado.
 *   Os agendamentos usam `singletonKey`, então várias instâncias não duplicam jobs recorrentes.
 */
export async function startJobs(): Promise<void> {
  // Segunda linha de defesa da política de retenção (ADR-0035): sem ela válida, nenhum job sobe.
  assertRetentionPolicy(getEnv());
  const { jobs } = getAdapters();
  registerAuthJobs(jobs, getAuthService());
  registerPrivacyJobs(jobs, {
    service: getPrivacyService(),
    eliminator: getHealthDataEliminator(),
  });
  // Lembretes (§33, ADR-0029): processados aqui, no servidor; não dependem do navegador aberto.
  registerReminderJobs(jobs, {
    service: getHealthServices().reminders,
    mail: getAdapters().mail,
    appUrl: getEnv().APP_URL,
    timeZone: APP_TIME_ZONE,
    listActive: activeRemindersFrom(getWorkerDb),
  });
  // Exportação e relatórios (ADR-0032): geração em segundo plano e expiração dos links (LEG-D03).
  registerReportJobs(jobs, getReportsService());
  // Alerta de volume anômalo (P7-M1, 7b-R3, ADR-0038): contadores do Postgres lidos pelo app_worker.
  registerObservabilityJobs(
    jobs,
    createVolumeMonitor({ workerDb: getWorkerDb, reporter: () => getAdapters().errorReporter }),
  );
  await scheduleAuthPurge(jobs);
  await schedulePrivacyJobs(jobs);
  await scheduleReportJobs(jobs);
  await scheduleReminderJobs(jobs);
  await scheduleObservabilityJobs(jobs);
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
