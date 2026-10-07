import { createHash } from 'node:crypto';
import type pg from 'pg';
import { MemoryJobQueue } from '@/adapters/jobs/memory';
import type { Db } from '@/lib/db/client';
import { withUserOn } from '@/lib/db/rls';
import { createLogger } from '@/lib/logger';
import { createHealthDataEliminator } from '@/modules/privacy/health-data';
import { registerPrivacyJobs, schedulePrivacyJobs } from '@/modules/privacy/jobs';
import { createPrivacyService } from '@/modules/privacy/service';
import { createTestConsent } from './consent-helpers';
import {
  connectAdmin,
  createTestAuth,
  createVerifiedUser,
  META,
  PASSWORD,
  runtimeDb,
  truncateAll,
  uniqueEmail,
  type TestAuth,
} from './helpers';

/**
 * Central de Privacidade (ADR-0019): encerramento de conta de menor (LEG-F04), provas fora da cascata do
 * expurgo (PR1a-R3-B8, LEG-R03), retenção do AccessLog (LEG-R02) e das provas, e jobs.
 */
let admin: pg.Client;
let db: Db;
let t: TestAuth;
const silent = createLogger({ sink: () => {} });

function privacy() {
  return createPrivacyService({
    db,
    logger: silent,
    reauthenticate: (userId, password) =>
      t.service.issueReauthProof(userId, password, 'minor_closure'),
    accessLogRetentionDays: 180,
    proofRetentionDays: 1825,
  });
}

/** Tabelas que podem referenciar users, com a ação esperada. Provas e AccessLog NÃO entram aqui. */
const USER_FKS: Record<string, string> = {
  sessions: 'CASCADE',
  recovery_codes: 'CASCADE',
  auth_tokens: 'CASCADE',
  reauth_proofs: 'CASCADE',
  // Dados de saúde (Fase 2, ADR-0021): saem com a conta; também cobertos pelo eliminador.
  sleep_entries: 'CASCADE',
  mood_entries: 'CASCADE',
  habits: 'CASCADE',
  habit_checks: 'CASCADE',
  journal_entries: 'CASCADE',
  body_measurements: 'CASCADE',
};
const PROOF_TABLES = ['consent_records', 'policy_acceptances', 'privacy_requests', 'audit_logs'];

beforeAll(async () => {
  admin = await connectAdmin();
  await truncateAll(admin);
  db = runtimeDb();
  t = createTestAuth(db);
});

afterAll(async () => {
  await db.$disconnect();
  await admin.end();
});

describe('PR1a-R3-B8: provas fora da cascata do expurgo de contas', () => {
  it('só tabelas de auth/dados do usuário têm FK para users (lista fechada)', async () => {
    const { rows } = await admin.query<{ table: string; action: string }>(
      `SELECT c.conrelid::regclass::text AS table,
              CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION'
                                 WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS action
         FROM pg_constraint c
        WHERE c.contype = 'f' AND c.confrelid = 'public.users'::regclass
          AND c.conrelid::regclass::text NOT LIKE '%test_health_fixture%'`,
    );
    const found = Object.fromEntries(rows.map((r) => [r.table.replace(/^public\./, ''), r.action]));
    // Tabela nova com FK para users? Decida: dado do usuário (CASCADE, entra aqui) ou prova (sem FK).
    expect(found).toEqual(USER_FKS);
    for (const table of [...PROOF_TABLES, 'access_logs']) expect(found[table]).toBeUndefined();
  });

  it('o expurgo de conta não verificada não apaga provas nem registros de acesso, e não falha', async () => {
    const email = uniqueEmail('sem-verificar');
    const age = (await t.service.checkAge('1990-01-01', new Headers())) as { cookie: string };
    await t.service.register({ email, password: PASSWORD, ageOkCookie: age.cookie }, META);
    const { rows } = await admin.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    const userId = rows[0]?.id ?? '';
    // Provas e acesso dessa conta (inseridos direto para simular qualquer caminho futuro).
    await admin.query(
      `INSERT INTO audit_logs (id, actor_user_id, subject_user_id, action, resource_type, updated_at)
       VALUES (gen_random_uuid(), $1, $1, 'policy_accepted', 'policy_version', now());
       INSERT INTO access_logs (id, user_id, ip, occurred_at, updated_at)
       VALUES (gen_random_uuid(), $1, '203.0.113.5', now(), now());
       INSERT INTO privacy_requests (id, user_id, kind, status, due_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'deletion', 'open', now(), now());`.replaceAll(
        '$1',
        `'${userId}'`,
      ),
    );
    await admin.query(`UPDATE users SET created_at = now() - interval '8 days' WHERE id = $1`, [
      userId,
    ]);
    const r = await t.service.purgeExpired();
    expect(r.unverified_users).toBeGreaterThanOrEqual(1);
    const left = await admin.query(
      `SELECT (SELECT count(*) FROM users WHERE id = $1)::int AS users,
              (SELECT count(*) FROM audit_logs WHERE subject_user_id = $1)::int AS audit,
              (SELECT count(*) FROM access_logs WHERE user_id = $1)::int AS access,
              (SELECT count(*) FROM privacy_requests WHERE user_id = $1)::int AS requests`,
      [userId],
    );
    expect(left.rows[0]).toEqual({ users: 0, audit: 1, access: 1, requests: 1 });
  });
});

describe('LEG-F04: encerramento de conta de quem se descobre menor', () => {
  it('senha errada não encerra nada', async () => {
    const u = await createVerifiedUser(t);
    expect(await privacy().closeMinorAccount(u.userId, 'senha errada sintética')).toBe(
      'invalid_password',
    );
    const { rows } = await admin.query('SELECT count(*)::int AS n FROM users WHERE id = $1', [
      u.userId,
    ]);
    expect(rows[0].n).toBe(1);
  });

  it('apaga a conta na hora e guarda só a prova mínima, sem e-mail', async () => {
    const u = await createVerifiedUser(t);
    const consent = createTestConsent(db, t.clock);
    await consent.service.completeOnboarding(u.userId, {
      acceptTerms: true,
      acceptPrivacy: true,
      purposes: ['health_data', 'marketing'],
    });
    expect(await privacy().closeMinorAccount(u.userId, PASSWORD)).toBe('closed');

    expect(await t.service.resolveSession(u.token)).toBeNull();
    const { rows } = await admin.query(
      `SELECT (SELECT count(*) FROM users WHERE id = $1)::int AS users,
              (SELECT count(*) FROM sessions WHERE user_id = $1)::int AS sessions,
              (SELECT count(*) FROM consent_records WHERE user_id = $1 AND revoked_at IS NULL)::int AS active`,
      [u.userId],
    );
    expect(rows[0]).toEqual({ users: 0, sessions: 0, active: 0 });

    const req = await admin.query(
      `SELECT kind, status, closed_at IS NOT NULL AS closed FROM privacy_requests WHERE user_id = $1`,
      [u.userId],
    );
    expect(req.rows).toEqual([{ kind: 'minor_closure', status: 'completed', closed: true }]);
    const audit = await admin.query(
      `SELECT action FROM audit_logs WHERE subject_user_id = $1 AND action IN
         ('privacy_request_created', 'account_closed_minor') ORDER BY action::text`,
      [u.userId],
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      'account_closed_minor',
      'privacy_request_created',
    ]);

    // Nenhuma linha restante guarda o e-mail.
    for (const table of [
      'consent_records',
      'policy_acceptances',
      'privacy_requests',
      'audit_logs',
    ]) {
      const all = await admin.query(`SELECT * FROM ${table}`);
      expect(JSON.stringify(all.rows), table).not.toContain(u.email);
    }
  });

  it('só encerra a própria conta (a função usa o contexto da transação)', async () => {
    const a = await createVerifiedUser(t);
    const b = await createVerifiedUser(t);
    await privacy().closeMinorAccount(a.userId, PASSWORD);
    const { rows } = await admin.query('SELECT count(*)::int AS n FROM users WHERE id = $1', [
      b.userId,
    ]);
    expect(rows[0].n).toBe(1);
  });

  it('teto global atingido: nada é apagado e o serviço responde "indisponível" (ADR-0020)', async () => {
    const u = await createVerifiedUser(t);
    await admin.query(
      `INSERT INTO audit_logs (id, action, resource_type, created_at, updated_at)
       SELECT gen_random_uuid(), 'account_closed_minor', 'user', now(), now() FROM generate_series(1, 50)`,
    );
    try {
      expect(await privacy().closeMinorAccount(u.userId, PASSWORD)).toBe('unavailable');
      const { rows } = await admin.query(
        `SELECT (SELECT count(*) FROM users WHERE id = $1)::int AS users,
                (SELECT count(*) FROM privacy_requests WHERE user_id = $1)::int AS requests`,
        [u.userId],
      );
      expect(rows[0]).toEqual({ users: 1, requests: 0 });
    } finally {
      await admin.query(
        `DELETE FROM audit_logs WHERE action = 'account_closed_minor' AND subject_user_id IS NULL`,
      );
    }
  });

  it('sem prova de reautenticação da própria pessoa, o banco recusa (revisão M1)', async () => {
    const a = await createVerifiedUser(t);
    const b = await createVerifiedUser(t);
    const fake = new Uint8Array(32);
    // Sem contexto, com contexto mas sem prova, e com a prova de A no contexto de B.
    await expect(db.$queryRaw`SELECT app.account_close_minor(${fake})::text`).rejects.toThrow();
    await expect(
      withUserOn(db, b.userId, (tx) => tx.$queryRaw`SELECT app.account_close_minor(${fake})::text`),
    ).rejects.toThrow(/reauthentication required/);
    const proofA = await t.service.issueReauthProof(a.userId, PASSWORD, 'minor_closure');
    const hashA = new Uint8Array(
      createHash('sha256')
        .update(proofA ?? '')
        .digest(),
    );
    await expect(
      withUserOn(
        db,
        b.userId,
        (tx) => tx.$queryRaw`SELECT app.account_close_minor(${hashA})::text`,
      ),
    ).rejects.toThrow(/reauthentication required/);
    // A prova vence em 2 minutos e é de uso único.
    await admin.query(
      `UPDATE reauth_proofs SET expires_at = now() - interval '1 second' WHERE user_id = $1`,
      [a.userId],
    );
    await expect(
      withUserOn(
        db,
        a.userId,
        (tx) => tx.$queryRaw`SELECT app.account_close_minor(${hashA})::text`,
      ),
    ).rejects.toThrow(/reauthentication required/);
    const { rows } = await admin.query(
      'SELECT count(*)::int AS n FROM users WHERE id = ANY($1::uuid[])',
      [[a.userId, b.userId]],
    );
    expect(rows[0].n).toBe(2);
    // O runtime não lê nem grava provas de reautenticação direto.
    await expect(db.$queryRaw`SELECT * FROM reauth_proofs`).rejects.toThrow(/permission denied/);
  });
});

describe('pedidos do titular (LEG-D07)', () => {
  it('lista só os pedidos abertos da própria pessoa', async () => {
    const a = await createVerifiedUser(t);
    const b = await createVerifiedUser(t);
    await admin.query(
      `INSERT INTO privacy_requests (id, user_id, kind, status, due_at, updated_at) VALUES
        (gen_random_uuid(), $1, 'portability', 'open', now() + interval '15 days', now()),
        (gen_random_uuid(), $1, 'correction', 'completed', now(), now()),
        (gen_random_uuid(), $2, 'deletion', 'open', now(), now())`,
      [a.userId, b.userId],
    );
    const list = await privacy().listOpenRequests(a.userId);
    expect(list.map((r) => [r.kind, r.status])).toEqual([['portability', 'open']]);
    // O runtime não cria nem altera pedidos diretamente.
    await expect(db.$executeRaw`UPDATE privacy_requests SET status = 'completed'`).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('retenção (LEG-R02, LEG-R03)', () => {
  it('AccessLog: apaga só o que passou de ACCESS_LOG_RETENTION_DAYS', async () => {
    await admin.query(
      `INSERT INTO access_logs (id, user_id, ip, occurred_at, updated_at) VALUES
        (gen_random_uuid(), NULL, '203.0.113.1', now() - interval '181 days', now()),
        (gen_random_uuid(), NULL, '203.0.113.2', now() - interval '179 days', now())`,
    );
    expect(await privacy().purgeAccessLogs()).toBe(1);
    const { rows } = await admin.query(
      `SELECT host(ip) AS ip FROM access_logs WHERE ip IN ('203.0.113.1', '203.0.113.2')`,
    );
    expect(rows).toEqual([{ ip: '203.0.113.2' }]);
  });

  it('provas: apaga revogações e registros de contas encerradas além do prazo; mantém o vigente', async () => {
    const u = await createVerifiedUser(t);
    const c = createTestConsent(db, t.clock);
    await c.service.completeOnboarding(u.userId, {
      acceptTerms: true,
      acceptPrivacy: true,
      purposes: ['marketing', 'health_data'],
    });
    await c.service.revoke(u.userId, 'marketing');
    // Envelhece os registros. O gatilho de integridade impede qualquer UPDATE além da revogação,
    // então fica desligado só nesta transação de simulação.
    await admin.query('BEGIN');
    await admin.query('ALTER TABLE consent_records DISABLE TRIGGER consent_records_guard');
    await admin.query(
      `UPDATE consent_records SET granted_at = now() - interval '3000 days',
              revoked_at = CASE WHEN revoked_at IS NULL THEN NULL ELSE now() - interval '2000 days' END
        WHERE user_id = $1`,
      [u.userId],
    );
    await admin.query('ALTER TABLE consent_records ENABLE TRIGGER consent_records_guard');
    await admin.query('COMMIT');
    await admin.query(
      `UPDATE audit_logs SET created_at = now() - interval '2000 days' WHERE subject_user_id = $1`,
      [u.userId],
    );
    await privacy().purgeProofs();
    const { rows } = await admin.query(`SELECT purpose FROM consent_records WHERE user_id = $1`, [
      u.userId,
    ]);
    // Consentimento vigente fica, mesmo antigo; a revogação antiga sai.
    expect(rows).toEqual([{ purpose: 'health_data' }]);
    const audit = await admin.query(
      'SELECT count(*)::int AS n FROM audit_logs WHERE subject_user_id = $1',
      [u.userId],
    );
    expect(audit.rows[0].n).toBe(0);
  });

  it('o prazo das provas tem piso de 1 ano no banco', async () => {
    await expect(db.$queryRaw`SELECT app.privacy_purge_proofs(30)`).rejects.toThrow();
    await expect(db.$queryRaw`SELECT app.privacy_purge_access_logs(365)`).rejects.toThrow();
  });
});

describe('jobs de privacidade', () => {
  it('a varredura diária reencontra eliminações vencidas e o job elimina', async () => {
    const u = await createVerifiedUser(t);
    const c = createTestConsent(db, t.clock);
    await c.service.completeOnboarding(u.userId, {
      acceptTerms: true,
      acceptPrivacy: true,
      purposes: ['health_data'],
    });
    await c.service.revoke(u.userId, 'health_data');
    // Simula o job agendado perdido e o prazo vencido.
    await admin.query(
      `UPDATE users SET health_data_purge_at = now() - interval '1 minute' WHERE id = $1`,
      [u.userId],
    );
    const queue = new MemoryJobQueue(silent);
    registerPrivacyJobs(queue, {
      service: privacy(),
      eliminator: createHealthDataEliminator({ db, logger: silent }),
    });
    await schedulePrivacyJobs(queue);
    await schedulePrivacyJobs(queue); // segunda instância: não duplica
    await queue.drain(); // recorrentes: varredura enfileira a eliminação
    await queue.drain(); // eliminação
    const { rows } = await admin.query('SELECT health_data_purge_at FROM users WHERE id = $1', [
      u.userId,
    ]);
    expect(rows[0].health_data_purge_at).toBeNull();
    const audit = await admin.query(
      `SELECT count(*)::int AS n FROM audit_logs WHERE subject_user_id = $1 AND action = 'health_data_eliminated'`,
      [u.userId],
    );
    expect(audit.rows[0].n).toBe(1);
  });
});
