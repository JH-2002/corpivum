import type pg from 'pg';
import type { Db } from '@/lib/db/client';
import { withUserOn, type Tx } from '@/lib/db/rls';
import { ConsentRequiredError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { CURRENT_VERSIONS } from '@/modules/consent/catalog';
import { MemoryJobQueue } from '@/adapters/jobs/memory';
import { withConsentOn } from '@/modules/consent/guard';
import { createConsentService } from '@/modules/consent/service';
import { healthEliminationKey } from '@/modules/consent/health';
import { createHealthDataEliminator } from '@/modules/privacy/health-data';
import {
  createHealthFixture,
  createTestConsent,
  dropHealthFixture,
  FIXTURE,
  publishVersion,
  unpublishVersion,
} from './consent-helpers';
import {
  connectAdmin,
  createTestAuth,
  createVerifiedUser,
  runtimeDb,
  truncateAll,
  type TestAuth,
} from './helpers';

/**
 * Consentimento por finalidade (LEG-C01–C06), guard de tratamento (CLAUDE.md regra 1) e revogação dos
 * dados de saúde com eliminação agendada (ADR-0019).
 */
let admin: pg.Client;
let db: Db;
let t: TestAuth;

const ALL = { acceptTerms: true, acceptPrivacy: true } as const;

async function onboarded(purposes: Array<'health_data' | 'marketing' | 'product_metrics'>) {
  const u = await createVerifiedUser(t);
  const c = createTestConsent(db, t.clock);
  expect(await c.service.completeOnboarding(u.userId, { ...ALL, purposes })).toEqual({ ok: true });
  return { ...u, ...c };
}

const writeFixture = (userId: string, value = 1) =>
  withConsentOn(db, userId, 'health_data', (tx) =>
    tx.$executeRawUnsafe(
      `INSERT INTO ${FIXTURE} (user_id, value) VALUES ($1::uuid, $2)`,
      userId,
      value,
    ),
  );
const readFixtureRls = (userId: string) =>
  withUserOn(db, userId, async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM ${FIXTURE}`,
    );
    return rows[0]?.n ?? -1;
  });
const insertFixtureRls = (userId: string) =>
  withUserOn(db, userId, (tx) =>
    tx.$executeRawUnsafe(`INSERT INTO ${FIXTURE} (user_id, value) VALUES ($1::uuid, 9)`, userId),
  );

beforeAll(async () => {
  admin = await connectAdmin();
  await truncateAll(admin);
  await createHealthFixture(admin);
  db = runtimeDb();
  t = createTestAuth(db);
});

afterAll(async () => {
  await dropHealthFixture(admin);
  await db.$disconnect();
  await admin.end();
});

describe('onboarding e escolhas por finalidade (LEG-C01–C03, C05)', () => {
  it('conta nova: nenhuma finalidade autorizada e onboarding pendente', async () => {
    const u = await createVerifiedUser(t);
    const { service } = createTestConsent(db, t.clock);
    const state = await service.getState(u.userId);
    expect(state.onboardingCompleted).toBe(false);
    expect(state.purposes.every((p) => !p.active)).toBe(true);
    expect(state.health).toEqual({ status: 'missing' });
  });

  it('sem aceitar Termos e Política, nada é gravado', async () => {
    const u = await createVerifiedUser(t);
    const { service } = createTestConsent(db, t.clock);
    const r = await service.completeOnboarding(u.userId, {
      acceptTerms: true,
      acceptPrivacy: false,
      purposes: ['health_data'],
    });
    expect(r).toEqual({ ok: false, error: 'documents_required' });
    const { rows } = await admin.query(
      `SELECT (SELECT count(*) FROM consent_records WHERE user_id = $1)::int AS c,
              (SELECT count(*) FROM policy_acceptances WHERE user_id = $1)::int AS a`,
      [u.userId],
    );
    expect(rows[0]).toEqual({ c: 0, a: 0 });
  });

  it('grava só as finalidades marcadas, com versão e hash do texto exibido (LEG-C01)', async () => {
    const u = await onboarded(['health_data']);
    const state = await u.service.getState(u.userId);
    expect(state.onboardingCompleted).toBe(true);
    expect(state.updatePending).toBe(false);
    expect(Object.fromEntries(state.purposes.map((p) => [p.purpose, p.active]))).toEqual({
      health_data: true,
      marketing: false,
      product_metrics: false,
    });
    const { rows } = await admin.query(
      `SELECT c.purpose, c.text_hash, v.version, c.revoked_at
         FROM consent_records c JOIN policy_versions v ON v.id = c.policy_version_id
        WHERE c.user_id = $1`,
      [u.userId],
    );
    expect(rows).toEqual([
      {
        purpose: 'health_data',
        text_hash: CURRENT_VERSIONS.consent_health_data.textHash,
        version: CURRENT_VERSIONS.consent_health_data.version,
        revoked_at: null,
      },
    ]);
    const docs = await admin.query(
      `SELECT v.document FROM policy_acceptances a JOIN policy_versions v ON v.id = a.policy_version_id
        WHERE a.user_id = $1 ORDER BY 1`,
      [u.userId],
    );
    expect(docs.rows.map((r) => r.document)).toEqual(['privacy_policy', 'terms']);
  });

  it('recusar tudo também conclui o onboarding (o app não é bloqueado, LEG-C05)', async () => {
    const u = await onboarded([]);
    const state = await u.service.getState(u.userId);
    expect(state.onboardingCompleted).toBe(true);
    expect(state.health).toEqual({ status: 'missing' });
  });

  it('finalidades revogadas (IA, transferência, ADR-0030) são recusadas pelo serviço', async () => {
    const u = await onboarded([]);
    for (const purpose of ['ai_sharing', 'international_transfer']) {
      expect(await u.service.grant(u.userId, purpose)).toEqual({ ok: false, error: 'unavailable' });
      expect(await u.service.revoke(u.userId, purpose)).toEqual({
        ok: false,
        error: 'unavailable',
      });
    }
  });

  it('o banco recusa publicar texto das finalidades revogadas (ADR-0030)', async () => {
    for (const document of ['consent_ai_sharing', 'consent_international_transfer']) {
      await expect(
        admin.query(
          `INSERT INTO policy_versions (id, document, version, text_hash, requires_reconsent, published_at, updated_at)
           VALUES (gen_random_uuid(), $1, 1, 'x', true, now(), now())`,
          [document],
        ),
      ).rejects.toMatchObject({ code: '23514', constraint: 'policy_versions_document_ativo' });
    }
  });

  it('consent_records recusa finalidade revogada mesmo sem o gatilho (CHECK, ADR-0030)', async () => {
    const { rows: versions } = await admin.query<{ id: string }>(
      `SELECT id FROM policy_versions WHERE document = 'consent_marketing' LIMIT 1`,
    );
    await admin.query('BEGIN');
    try {
      await admin.query('ALTER TABLE consent_records DISABLE TRIGGER consent_records_guard');
      await expect(
        admin.query(
          `INSERT INTO consent_records (id, user_id, purpose, policy_version_id, text_hash, granted_at, updated_at)
           VALUES (gen_random_uuid(), gen_random_uuid(), 'ai_sharing', $1, 'x', now(), now())`,
          [versions[0]?.id],
        ),
      ).rejects.toMatchObject({ code: '23514', constraint: 'consent_records_purpose_ativo' });
    } finally {
      await admin.query('ROLLBACK');
    }
  });

  it('consent_records tem a CHECK das finalidades revogadas (ADR-0030)', async () => {
    const { rows } = await admin.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'consent_records_purpose_ativo' AND conrelid = 'public.consent_records'::regclass`,
    );
    expect(rows[0]?.def).toMatch(/ai_sharing/);
    expect(rows[0]?.def).toMatch(/international_transfer/);
  });
});

describe('guard de tratamento e revogação imediata (LEG-C04)', () => {
  it('com consentimento grava e lê; ao revogar, a PRÓXIMA operação já é bloqueada (app e RLS)', async () => {
    const u = await onboarded(['health_data']);
    await writeFixture(u.userId, 1);
    expect(await readFixtureRls(u.userId)).toBe(1);

    await u.service.revoke(u.userId, 'health_data');

    await expect(writeFixture(u.userId, 2)).rejects.toBeInstanceOf(ConsentRequiredError);
    // Mesmo sem o guard da aplicação, o banco não mostra nem aceita dados (falha fechada).
    expect(await readFixtureRls(u.userId)).toBe(0);
    await expect(insertFixtureRls(u.userId)).rejects.toThrow();
    // Os dados continuam lá até a eliminação agendada.
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM ${FIXTURE} WHERE user_id = $1`,
      [u.userId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('sem consentimento algum, nada é tratado', async () => {
    const u = await onboarded([]);
    await expect(writeFixture(u.userId)).rejects.toBeInstanceOf(ConsentRequiredError);
    await expect(insertFixtureRls(u.userId)).rejects.toThrow();
  });

  it('revogar marketing ou métricas não afeta os dados de bem-estar (LEG-C05)', async () => {
    const u = await onboarded(['health_data', 'marketing', 'product_metrics']);
    await u.service.revoke(u.userId, 'marketing');
    await u.service.revoke(u.userId, 'product_metrics');
    await writeFixture(u.userId);
    const state = await u.service.getState(u.userId);
    expect(state.purposes.find((p) => p.purpose === 'health_data')?.active).toBe(true);
    expect(state.purposes.find((p) => p.purpose === 'marketing')?.active).toBe(false);
  });

  it('o consentimento de uma pessoa não vale para outra', async () => {
    const a = await onboarded(['health_data']);
    const b = await onboarded([]);
    await expect(writeFixture(b.userId)).rejects.toBeInstanceOf(ConsentRequiredError);
    // A não consegue gravar em nome de B.
    await expect(
      withConsentOn(db, a.userId, 'health_data', (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO ${FIXTURE} (user_id, value) VALUES ($1::uuid, 1)`,
          b.userId,
        ),
      ),
    ).rejects.toThrow();
  });
});

describe('revogação dos dados de saúde: eliminação agendada (ADR-0019)', () => {
  it('agenda a eliminação em 30 dias; reconsentir antes cancela (fila Postgres)', async () => {
    const u = await createVerifiedUser(t);
    const { service } = createTestConsent(db, t.clock, undefined, 'postgres');
    await service.completeOnboarding(u.userId, { ...ALL, purposes: ['health_data'] });
    const r = await service.revoke(u.userId, 'health_data');
    if (!r.ok) throw new Error('revoke');
    expect(r.purgeAt?.getTime()).toBe(t.clock.now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const state = await service.getState(u.userId);
    expect(state.health).toEqual({ status: 'revoked', purgeAt: r.purgeAt });
    const queued = () =>
      admin
        .query('SELECT count(*)::int AS n FROM job_queue WHERE singleton_key = $1', [
          healthEliminationKey(u.userId),
        ])
        .then((x) => x.rows[0].n);
    expect(await queued()).toBe(1);

    expect(await service.grant(u.userId, 'health_data')).toEqual({ ok: true });
    expect(await queued()).toBe(0);
    expect((await service.getState(u.userId)).health).toEqual({ status: 'active' });
    const { rows } = await admin.query(
      `SELECT action FROM audit_logs WHERE subject_user_id = $1 AND action::text LIKE 'health_data%'
        ORDER BY created_at`,
      [u.userId],
    );
    expect(rows.map((x) => x.action)).toEqual([
      'health_data_elimination_scheduled',
      'health_data_elimination_cancelled',
    ]);
  });

  it('vencido o prazo sem reconsentimento, o eliminador apaga os dados de saúde', async () => {
    const erasers = { fixture: (tx: Tx) => tx.$executeRawUnsafe(`DELETE FROM ${FIXTURE}`) };
    const u = await onboarded(['health_data']);
    await writeFixture(u.userId, 1);
    await writeFixture(u.userId, 2);
    await u.service.revoke(u.userId, 'health_data');
    const eliminator = createHealthDataEliminator({
      db,
      erasers,
      eraseObjects: async () => {},
      logger: createLogger({ sink: () => {} }),
      now: () => t.clock.now,
    });
    // Antes do prazo: nada acontece.
    expect(await eliminator.eliminate(u.userId)).toBe('skipped');
    await admin.query(
      `UPDATE users SET health_data_purge_at = $2::timestamptz - interval '1 minute' WHERE id = $1`,
      [u.userId, t.clock.now],
    );
    expect(await eliminator.eliminate(u.userId)).toBe('eliminated');
    const { rows } = await admin.query(
      `SELECT (SELECT count(*) FROM ${FIXTURE} WHERE user_id = $1)::int AS n,
              (SELECT health_data_purge_at FROM users WHERE id = $1) AS purge`,
      [u.userId],
    );
    expect(rows[0]).toEqual({ n: 0, purge: null });
    const audit = await admin.query(
      `SELECT actor_user_id FROM audit_logs WHERE subject_user_id = $1 AND action = 'health_data_eliminated'`,
      [u.userId],
    );
    // Feito pelo sistema em nome do titular: sem ator humano.
    expect(audit.rows).toEqual([{ actor_user_id: null }]);
    // Rodar de novo não faz nada.
    expect(await eliminator.eliminate(u.userId)).toBe('skipped');
  });

  it('o eliminador não apaga quem reconsentiu (job atrasado ou duplicado vira no-op)', async () => {
    const erasers = { fixture: (tx: Tx) => tx.$executeRawUnsafe(`DELETE FROM ${FIXTURE}`) };
    const u = await onboarded(['health_data']);
    await writeFixture(u.userId);
    await u.service.revoke(u.userId, 'health_data');
    await u.service.grant(u.userId, 'health_data');
    const eliminator = createHealthDataEliminator({
      db,
      erasers,
      eraseObjects: async () => {},
      logger: createLogger({ sink: () => {} }),
      now: () => new Date(t.clock.now.getTime() + 60 * 24 * 60 * 60 * 1000),
    });
    expect(await eliminator.eliminate(u.userId)).toBe('skipped');
    expect(await readFixtureRls(u.userId)).toBe(1);
  });
});

describe('reconsentimento após versão substancial nova (LEG-C06)', () => {
  it('reorientação (ADR-0027): quem autorizou a v1 da saúde fica pendente até escolher de novo', async () => {
    const u = await onboarded([]);
    const { rows } = await admin.query<{ id: string; text_hash: string }>(
      `SELECT id, text_hash FROM policy_versions WHERE document = 'consent_health_data' AND version = 1`,
    );
    const v1 = rows[0];
    if (!v1) throw new Error('v1 não publicada');
    // Conta de antes da v2: o gatilho só aceita a versão vigente, então a prova antiga entra com os
    // gatilhos desligados numa transação (banco descartável de teste; o dono da tabela pode).
    await admin.query('BEGIN');
    try {
      await admin.query('ALTER TABLE consent_records DISABLE TRIGGER USER');
      await admin.query(
        `INSERT INTO consent_records (id, user_id, purpose, policy_version_id, text_hash, granted_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'health_data', $2, $3, now() - interval '1 day', now())`,
        [u.userId, v1.id, v1.text_hash],
      );
      await admin.query('ALTER TABLE consent_records ENABLE TRIGGER USER');
      await admin.query('COMMIT');
    } catch (error) {
      await admin.query('ROLLBACK');
      throw error;
    }
    expect(CURRENT_VERSIONS.consent_health_data).toMatchObject({
      version: 2,
      requiresReconsent: true,
    });
    await expect(writeFixture(u.userId)).rejects.toBeInstanceOf(ConsentRequiredError);
    const state = await u.service.getState(u.userId);
    expect(state.updatePending).toBe(true);
    expect(state.purposes.find((p) => p.purpose === 'health_data')).toMatchObject({
      active: false,
      needsReconsent: true,
    });
    expect(
      await u.service.resolveUpdate(u.userId, {
        acceptDocuments: [],
        decisions: { health_data: 'keep' },
      }),
    ).toEqual({ ok: true });
    await writeFixture(u.userId);
  });

  it('versão substancial nova suspende o consentimento até a pessoa escolher de novo', async () => {
    const a = await onboarded(['health_data']);
    const b = await onboarded(['health_data']);
    const hash = 'a'.repeat(64);
    const next = CURRENT_VERSIONS.consent_health_data.version + 1;
    const v2 = await publishVersion(admin, 'consent_health_data', next, hash, true);
    const catalog = {
      ...CURRENT_VERSIONS,
      consent_health_data: { version: next, textHash: hash, requiresReconsent: true },
    };
    try {
      for (const u of [a, b]) {
        await expect(writeFixture(u.userId)).rejects.toBeInstanceOf(ConsentRequiredError);
        const state = await createTestConsent(db, t.clock, catalog).service.getState(u.userId);
        expect(state.updatePending).toBe(true);
        expect(state.purposes.find((p) => p.purpose === 'health_data')).toMatchObject({
          active: false,
          needsReconsent: true,
        });
      }
      const ca = createTestConsent(db, t.clock, catalog);
      // Sem escolha explícita para a pendência: recusado.
      expect(
        await ca.service.resolveUpdate(a.userId, { acceptDocuments: [], decisions: {} }),
      ).toEqual({
        ok: false,
        error: 'decision_required',
      });
      expect(
        await ca.service.resolveUpdate(a.userId, {
          acceptDocuments: [],
          decisions: { health_data: 'keep' },
        }),
      ).toEqual({ ok: true });
      await writeFixture(a.userId);
      expect((await ca.service.getState(a.userId)).updatePending).toBe(false);

      const cb = createTestConsent(db, t.clock, catalog);
      await cb.service.resolveUpdate(b.userId, {
        acceptDocuments: [],
        decisions: { health_data: 'decline' },
      });
      const sb = await cb.service.getState(b.userId);
      expect(sb.updatePending).toBe(false);
      expect(sb.health.status).toBe('revoked');
    } finally {
      await unpublishVersion(admin, v2);
    }
  });

  it('versão não substancial mantém o consentimento e novos registros usam a versão nova', async () => {
    const u = await onboarded(['marketing']);
    const hash = 'b'.repeat(64);
    const v2 = await publishVersion(admin, 'consent_marketing', 2, hash, false);
    const catalog = {
      ...CURRENT_VERSIONS,
      consent_marketing: { version: 2, textHash: hash, requiresReconsent: false },
    };
    try {
      const c = createTestConsent(db, t.clock, catalog);
      const state = await c.service.getState(u.userId);
      expect(state.updatePending).toBe(false);
      expect(state.purposes.find((p) => p.purpose === 'marketing')?.active).toBe(true);
      const other = await onboarded([]);
      await c.service.grant(other.userId, 'marketing');
      const { rows } = await admin.query(
        `SELECT v.version FROM consent_records c JOIN policy_versions v ON v.id = c.policy_version_id
          WHERE c.user_id = $1`,
        [other.userId],
      );
      expect(rows).toEqual([{ version: 2 }]);
    } finally {
      await unpublishVersion(admin, v2);
    }
  });

  it('código com texto diferente da versão publicada não grava consentimento', async () => {
    const u = await onboarded([]);
    const wrong = createTestConsent(db, t.clock, {
      ...CURRENT_VERSIONS,
      consent_marketing: { version: 1, textHash: 'c'.repeat(64), requiresReconsent: true },
    });
    await expect(wrong.service.grant(u.userId, 'marketing')).rejects.toThrow(/diverge/);
  });
});

describe('Termos v2 não substancial: aviso único e ciência (ADR-0031)', () => {
  /** Simula quem aceitou os Termos v1: aponta o aceite para a v1 (só o admin, no banco de teste). */
  async function acceptedTermsV1() {
    const u = await onboarded([]);
    await admin.query(
      `UPDATE policy_acceptances a SET policy_version_id = v1.id
         FROM policy_versions v1, policy_versions cur
        WHERE a.user_id = $1 AND a.policy_version_id = cur.id AND cur.document = 'terms'
          AND v1.document = 'terms' AND v1.version = 1`,
      [u.userId],
    );
    return u;
  }

  const termsRows = (userId: string) =>
    admin
      .query<{ version: number; kind: string }>(
        `SELECT v.version, a.kind::text AS kind FROM policy_acceptances a
           JOIN policy_versions v ON v.id = a.policy_version_id
          WHERE a.user_id = $1 AND v.document = 'terms' ORDER BY v.version`,
        [userId],
      )
      .then((r) => r.rows);

  it('a v2 está publicada como não substancial', () => {
    expect(CURRENT_VERSIONS.terms).toMatchObject({ version: 2, requiresReconsent: false });
  });

  it('quem aceitou a v1 não é bloqueado e vê o aviso uma vez; "Entendi" registra a ciência', async () => {
    const u = await acceptedTermsV1();
    const before = await u.service.getState(u.userId);
    expect(before.updatePending).toBe(false);
    expect(before.documentNotices).toEqual(['terms']);
    expect(before.documents.find((d) => d.document === 'terms')).toMatchObject({
      acceptedVersion: 1,
      needsAcceptance: false,
      noticePending: true,
    });

    expect(await u.service.acknowledgeDocuments(u.userId, ['terms'])).toBe(1);
    const after = await u.service.getState(u.userId);
    expect(after.documentNotices).toEqual([]);
    // O aceite continua sendo o da v1; a v2 fica registrada como ciência, não como aceite.
    expect(after.documents.find((d) => d.document === 'terms')?.acceptedVersion).toBe(1);
    expect(await termsRows(u.userId)).toEqual([
      { version: 1, kind: 'accepted' },
      { version: 2, kind: 'acknowledged' },
    ]);
    const { rows } = await admin.query(
      `SELECT action::text FROM audit_logs WHERE subject_user_id = $1 AND action = 'policy_acknowledged'`,
      [u.userId],
    );
    expect(rows).toHaveLength(1);

    // Idempotente: um segundo "Entendi" não grava nada.
    expect(await u.service.acknowledgeDocuments(u.userId, ['terms'])).toBe(0);
    expect(await termsRows(u.userId)).toHaveLength(2);
  });

  it('conta nova aceita a v2 no onboarding e não vê aviso', async () => {
    const u = await onboarded([]);
    const state = await u.service.getState(u.userId);
    expect(state.documentNotices).toEqual([]);
    expect(await u.service.acknowledgeDocuments(u.userId, ['terms', 'privacy_policy'])).toBe(0);
    expect(await termsRows(u.userId)).toEqual([{ version: 2, kind: 'accepted' }]);
  });

  it('o banco recusa ciência sem versão anterior ou de versão substancial', async () => {
    const u = await onboarded([]);
    const { rows } = await admin.query<{ document: string; id: string }>(
      `SELECT DISTINCT ON (document) document::text, id FROM policy_versions
        WHERE document IN ('terms', 'privacy_policy') ORDER BY document, version DESC`,
    );
    for (const row of rows) {
      // Termos v2: a pessoa não tem versão anterior. Política v1: versão substancial.
      await expect(
        withUserOn(db, u.userId, (tx) =>
          tx.policyAcceptance.create({
            data: {
              userId: u.userId,
              policyVersionId: row.id,
              kind: 'acknowledged',
              acceptedAt: new Date(),
            },
          }),
        ),
      ).rejects.toThrow();
    }
  });
});

describe('ciência nunca substitui um aceite exigido (ADR-0031, revisão A1)', () => {
  it('com versão substancial pendente, a ciência de uma versão não substancial posterior é recusada', async () => {
    const u = await onboarded([]);
    const v3 = await publishVersion(admin, 'terms', 3, 'c'.repeat(64), true);
    const v4 = await publishVersion(admin, 'terms', 4, 'd'.repeat(64), false);
    const catalog = {
      ...CURRENT_VERSIONS,
      terms: { version: 4, textHash: 'd'.repeat(64), requiresReconsent: false },
    };
    try {
      const c = createTestConsent(db, t.clock, catalog);
      const state = await c.service.getState(u.userId);
      expect(state.updatePending).toBe(true);
      expect(state.documentNotices).toEqual([]);
      // Serviço e banco recusam a ciência no lugar do aceite da v3.
      expect(await c.service.acknowledgeDocuments(u.userId, ['terms'])).toBe(0);
      await expect(
        withUserOn(db, u.userId, (tx) =>
          tx.policyAcceptance.create({
            data: {
              userId: u.userId,
              policyVersionId: v4,
              kind: 'acknowledged',
              acceptedAt: new Date(),
            },
          }),
        ),
      ).rejects.toThrow();
      // O aceite exigido continua possível e resolve a pendência.
      expect(
        await c.service.resolveUpdate(u.userId, { acceptDocuments: ['terms'], decisions: {} }),
      ).toEqual({ ok: true });
      const after = await c.service.getState(u.userId);
      expect(after.updatePending).toBe(false);
      expect(after.documents.find((d) => d.document === 'terms')?.acceptedVersion).toBe(4);
    } finally {
      await unpublishVersion(admin, v4);
      await unpublishVersion(admin, v3);
    }
  });

  it('ninguém registra ciência em nome de outra pessoa (RLS)', async () => {
    const a = await onboarded([]);
    const b = await onboarded([]);
    const { rows } = await admin.query<{ id: string }>(
      `SELECT id FROM policy_versions WHERE document = 'terms' ORDER BY version DESC LIMIT 1`,
    );
    await expect(
      withUserOn(db, a.userId, (tx) =>
        tx.policyAcceptance.create({
          data: {
            userId: b.userId,
            policyVersionId: rows[0]?.id ?? '',
            kind: 'acknowledged',
            acceptedAt: new Date(),
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

describe('integridade das provas (LEG-R03, LEG-S06)', () => {
  it('as datas das provas vêm do relógio do banco, não do cliente (revisão B1)', async () => {
    const u = await onboarded([]);
    const { rows: v } = await admin.query(
      `SELECT id, text_hash FROM policy_versions WHERE document = 'consent_marketing' AND version = 1`,
    );
    const past = new Date('2000-01-01T00:00:00Z');
    await withUserOn(db, u.userId, async (tx) => {
      const r = await tx.consentRecord.create({
        data: {
          userId: u.userId,
          purpose: 'marketing',
          policyVersionId: v[0].id,
          textHash: v[0].text_hash,
          grantedAt: past,
        },
      });
      await tx.consentRecord.update({ where: { id: r.id }, data: { revokedAt: past } });
    });
    const { rows } = await admin.query(
      `SELECT granted_at > now() - interval '1 minute' AS granted, revoked_at > now() - interval '1 minute' AS revoked
         FROM consent_records WHERE user_id = $1`,
      [u.userId],
    );
    expect(rows).toEqual([{ granted: true, revoked: true }]);
  });

  it('M3: o serviço recusa prazo diferente do escrito no texto do consentimento', () => {
    expect(() =>
      createConsentService({
        db,
        jobs: new MemoryJobQueue(),
        logger: createLogger({ sink: () => {} }),
        healthDataGraceDays: 45,
      }),
    ).toThrow(/HEALTH_DATA_GRACE_DAYS/);
  });

  it('o runtime não apaga consentimento, não desfaz revogação e não grava hash falso', async () => {
    const u = await onboarded(['marketing']);
    await withUserOn(db, u.userId, async (tx) => {
      await expect(tx.consentRecord.deleteMany({})).rejects.toThrow();
    });
    await u.service.revoke(u.userId, 'marketing');
    await expect(
      withUserOn(db, u.userId, (tx) =>
        tx.consentRecord.updateMany({ where: {}, data: { revokedAt: null } }),
      ),
    ).rejects.toThrow();
    const { rows } = await admin.query(
      `SELECT id FROM policy_versions WHERE document = 'consent_marketing' AND version = 1`,
    );
    await expect(
      withUserOn(db, u.userId, (tx) =>
        tx.consentRecord.create({
          data: {
            userId: u.userId,
            purpose: 'marketing',
            policyVersionId: rows[0].id,
            textHash: 'f'.repeat(64),
            grantedAt: new Date(),
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withUserOn(db, u.userId, (tx) => tx.policyVersion.deleteMany({})),
    ).rejects.toThrow();
  });

  it('AuditLog não tem coluna de texto livre e não guarda e-mail nem conteúdo', async () => {
    const { rows: cols } = await admin.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'audit_logs'`,
    );
    // Única coluna de texto: o papel de login de quem atendeu (ADR-0037), restrito a um nome técnico.
    for (const c of cols.filter((col) => col.column_name !== 'operator_role')) {
      expect(['text', 'character varying', 'json', 'jsonb'], c.column_name).not.toContain(
        c.data_type,
      );
    }
    await expect(
      admin.query(
        `INSERT INTO audit_logs (id, action, resource_type, operator_role, created_at, updated_at)
         VALUES (gen_random_uuid(), 'privacy_request_closed', 'privacy_request', 'Maria@Exemplo', now(), now())`,
      ),
    ).rejects.toThrow(/audit_logs_operator_role/);
    const u = await onboarded(['health_data', 'marketing']);
    await u.service.revoke(u.userId, 'marketing');
    const { rows } = await admin.query(`SELECT * FROM audit_logs WHERE subject_user_id = $1`, [
      u.userId,
    ]);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(rows)).not.toContain(u.email);
    await expect(db.$queryRaw`SELECT * FROM audit_logs`).rejects.toThrow(/permission denied/);
  });

  it('logs do serviço só com metadados, sem ligar a conta à finalidade (revisão B5)', async () => {
    const u = await onboarded(['health_data']);
    await u.service.revoke(u.userId, 'health_data');
    expect(JSON.stringify(u.logs)).not.toContain(u.email);
    expect(JSON.stringify(u.logs)).not.toContain('health_data');
    for (const r of u.logs) {
      expect(Object.keys(r).sort()).toEqual(expect.arrayContaining(['event', 'level', 'ts']));
    }
  });
});
