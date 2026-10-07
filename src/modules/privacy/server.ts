import 'server-only';
import { getDb } from '@/lib/db/client';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getAuthService } from '@/modules/auth/server';
import { createHealthDataEliminator } from './health-data';
import { createPrivacyService, type PrivacyService } from './service';

/** Integração da Central de Privacidade com o Next (somente servidor). */
let service: PrivacyService | undefined;

export function getPrivacyService(): PrivacyService {
  if (!service) {
    const env = getEnv();
    service = createPrivacyService({
      db: getDb(),
      logger,
      reauthenticate: (userId, password) =>
        getAuthService().issueReauthProof(userId, password, 'minor_closure'),
      accessLogRetentionDays: env.ACCESS_LOG_RETENTION_DAYS,
      proofRetentionDays: env.PROOF_RETENTION_DAYS,
    });
  }
  return service;
}

export function getHealthDataEliminator() {
  return createHealthDataEliminator({ db: getDb(), logger });
}
