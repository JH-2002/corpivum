import 'server-only';
import { getAdapters } from '@/adapters';
import { reportRenderers } from '@/components/reports/render';
import { getDb, getWorkerDb } from '@/lib/db/client';
import { APP_TIME_ZONE } from '@/lib/dates';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { createOwnSource, todayIso } from '@/modules/health/server';
import { createReportsService, type ReportsService } from './service';

/** Integração da exportação e dos relatórios com o Next (somente servidor, ADR-0032). */
let service: ReportsService | undefined;

export function getReportsService(): ReportsService {
  if (!service) {
    const adapters = getAdapters();
    service = createReportsService({
      db: getDb(),
      workerDb: getWorkerDb,
      kms: adapters.kms,
      storage: adapters.storage,
      queue: adapters.jobs,
      logger,
      sourceFor: (userId) => createOwnSource(userId),
      render: reportRenderers,
      linkHours: getEnv().EXPORT_LINK_HOURS,
      timeZone: APP_TIME_ZONE,
      today: () => todayIso(),
    });
  }
  return service;
}

/**
 * Depois de um pedido, consome a fila em memória (dev/test) na hora, em vez de esperar o laço de 60 s. Por
 * método da interface, não por `instanceof`: no build, a action e a instrumentação têm cópias diferentes da
 * classe. A fila Postgres é consumida pelo worker (`JOB_WORKER`), sem atalho: nada muda em produção.
 */
export async function processExportsSoon(): Promise<void> {
  const { jobs } = getAdapters();
  await jobs.processNow?.().catch(() => logger.warn('job.drain_failed', { adapter: jobs.id }));
}
