import 'server-only';
import { getDb, getWorkerDb } from '@/lib/db/client';
import { APP_TIME_ZONE } from '@/lib/dates';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getAuthService } from '@/modules/auth/server';
import { getAdapters } from '@/adapters';
import { HEALTH_DATA_ERASERS } from '@/modules/health/erasers';
import { getReportsService } from '@/modules/reports/server';
import { eraseUserExports } from '@/modules/reports/storage';
import { createHealthDataEliminator } from './health-data';
import { createPrivacyService, type PrivacyService } from './service';

/** Integração da Central de Privacidade com o Next (somente servidor). */
let service: PrivacyService | undefined;

const eraseObjects = (userId: string) => eraseUserExports(getAdapters().storage, userId);

export function getPrivacyService(): PrivacyService {
  if (!service) {
    const env = getEnv();
    const adapters = getAdapters();
    service = createPrivacyService({
      db: getDb(),
      workerDb: getWorkerDb,
      logger,
      reauthenticate: (userId, password, purpose, mfaCode) =>
        getAuthService().issueReauthProof(userId, password, purpose, mfaCode),
      accessLogRetentionDays: env.ACCESS_LOG_RETENTION_DAYS,
      proofRetentionDays: env.PROOF_RETENTION_DAYS,
      backupRetentionDays: env.BACKUP_RETENTION_DAYS,
      erasers: HEALTH_DATA_ERASERS,
      eraseObjects,
      mail: adapters.mail,
      queue: adapters.jobs,
      // A action consome a fila em memória depois da resposta (`after(processExportsSoon)`), como na 6a.
      requestFullExport: async (userId) =>
        (await getReportsService().request(userId, { kind: 'full_export', format: 'json' }))
          .status === 'queued',
      appUrl: env.APP_URL,
      timeZone: APP_TIME_ZONE,
    });
  }
  return service;
}

export function getHealthDataEliminator() {
  return createHealthDataEliminator({
    db: getDb(),
    logger,
    erasers: HEALTH_DATA_ERASERS,
    eraseObjects,
  });
}
