import type pg from 'pg';
import { MemoryJobQueue } from '@/adapters/jobs/memory';
import { PgJobQueue } from '@/adapters/jobs/postgres';
import type { Db } from '@/lib/db/client';
import { createLogger, type LogRecord } from '@/lib/logger';
import {
  CURRENT_VERSIONS,
  type DocumentVersion,
  type PolicyDocument,
} from '@/modules/consent/catalog';
import { createConsentService } from '@/modules/consent/service';

/** Apoio aos testes de consentimento (ADR-0019). Dados 100% sintéticos. */
export function createTestConsent(
  db: Db,
  clock: { now: Date },
  catalog: Partial<Record<PolicyDocument, DocumentVersion>> = CURRENT_VERSIONS,
  queue: 'memory' | 'postgres' = 'memory',
) {
  const logs: LogRecord[] = [];
  const logger = createLogger({ minLevel: 'debug', sink: (r) => logs.push(r) });
  const jobs = queue === 'postgres' ? new PgJobQueue(db, { logger }) : new MemoryJobQueue(logger);
  const service = createConsentService({
    db,
    jobs,
    logger,
    healthDataGraceDays: 30,
    now: () => clock.now,
    catalog,
  });
  return { service, jobs, logs };
}

/**
 * Tabela de dados de saúde de mentira, com o padrão de política que as tabelas reais seguirão a partir da
 * Fase 2: leitura/escrita só com consentimento ativo; DELETE só por dono (para a eliminação).
 */
export const FIXTURE = 'public.test_health_fixture';

export async function createHealthFixture(admin: pg.Client): Promise<void> {
  await admin.query(`
    DROP TABLE IF EXISTS ${FIXTURE};
    CREATE TABLE ${FIXTURE} (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      value integer NOT NULL
    );
    ALTER TABLE ${FIXTURE} ENABLE ROW LEVEL SECURITY;
    CREATE POLICY fixture_select ON ${FIXTURE} FOR SELECT
      USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
    CREATE POLICY fixture_insert ON ${FIXTURE} FOR INSERT
      WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
    CREATE POLICY fixture_update ON ${FIXTURE} FOR UPDATE
      USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')))
      WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
    CREATE POLICY fixture_delete ON ${FIXTURE} FOR DELETE
      USING (user_id = (SELECT app.current_user_id()));
  `);
}

export async function dropHealthFixture(admin: pg.Client): Promise<void> {
  await admin.query(`DROP TABLE IF EXISTS ${FIXTURE}`);
}

/**
 * Publica uma versão nova de um documento (como faria uma migração) e devolve o id. Publicada 2 h antes:
 * o relógio de teste fica entre os minutos 1 e 40 da hora atual (stableTestClock).
 */
export async function publishVersion(
  admin: pg.Client,
  document: PolicyDocument,
  version: number,
  textHash: string,
  requiresReconsent: boolean,
): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    `INSERT INTO policy_versions (id, document, version, text_hash, requires_reconsent, published_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, now() - interval '2 hours', now()) RETURNING id`,
    [document, version, textHash, requiresReconsent],
  );
  return rows[0]?.id ?? '';
}

/** Remove a versão de teste e as provas que apontam para ela (só no banco descartável de teste). */
export async function unpublishVersion(admin: pg.Client, id: string): Promise<void> {
  await admin.query('DELETE FROM consent_records WHERE policy_version_id = $1', [id]);
  await admin.query('DELETE FROM policy_acceptances WHERE policy_version_id = $1', [id]);
  await admin.query('DELETE FROM policy_versions WHERE id = $1', [id]);
}
