import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { MemoryJobQueue } from '@/adapters/jobs/memory';
import { LocalStorageProvider } from '@/adapters/storage/local';
import type { MailProvider } from '@/adapters/mail/types';
import type { Db } from '@/lib/db/client';
import { withUserOn } from '@/lib/db/rls';
import { createLogger, type LogRecord } from '@/lib/logger';
import { HEALTH_DATA_ERASERS } from '@/modules/health/erasers';
import { createPrivacyService, type PrivacyDeps } from '@/modules/privacy/service';
import { eraseUserExports } from '@/modules/reports/storage';
import { createTestConsent } from './consent-helpers';
import {
  connectAdmin,
  createTestAuth,
  createVerifiedUser,
  PASSWORD,
  runtimeDb,
  type TestAuth,
  truncateAll,
  workerDb,
} from './helpers';
import { assertDisposableDatabase } from './safety';

/**
 * Fase 7b (ADR-0036, ADR-0037): saída da conta antes do onboarding e expurgo das contas sem onboarding (P7-M2),
 * registro e exclusão pelo encarregado com o papel de quem atendeu (OI-34 b, D5), purga só com pedido de
 * exclusão (P7-B1) e com os jobs da pessoa (P7-N2), AuditLog do sistema em lista fechada (PR1b-B2) e varredura
 * que pula contas com job falho (PR1b-B8). Dados 100% sintéticos.
 */
let admin: pg.Client;
let db: Db;
let t: TestAuth;
let storageDir: string;
let storage: LocalStorageProvider;
const silent = createLogger({ sink: () => {} });

function privacy(overrides: Partial<PrivacyDeps> = {}, logs?: LogRecord[]) {
  return createPrivacyService({
    db,
    workerDb,
    logger: logs ? createLogger({ minLevel: 'debug', sink: (r) => logs.push(r) }) : silent,
    reauthenticate: (userId, password, purpose, mfaCode) =>
      t.service.issueReauthProof(userId, password, purpose, mfaCode),
    accessLogRetentionDays: 180,
    proofRetentionDays: 1825,
    backupRetentionDays: 30,
    erasers: HEALTH_DATA_ERASERS,
    eraseObjects: (userId) => eraseUserExports(storage, userId),
    mail: t.mail,
    queue: new MemoryJobQueue(silent),
    requestFullExport: async () => false,
    appUrl: 'http://localhost:3000',
    timeZone: 'America/Sao_Paulo',
    ...overrides,
  });
}

async function onboarded() {
  const u = await createVerifiedUser(t);
  const c = createTestConsent(db, t.clock);
  expect(
    await c.service.completeOnboarding(u.userId, {
      acceptTerms: true,
      acceptPrivacy: true,
      purposes: ['health_data'],
    }),
  ).toEqual({ ok: true });
  return u;
}

/** Envelhece a conta: cadastro há `days` dias e, opcionalmente, aviso há `noticeDays` dias. */
async function age(userId: string, days: number, noticeDays?: number) {
  await admin.query(
    `UPDATE users SET created_at = now() - make_interval(days => $2),
            onboarding_expiry_notice_at = CASE WHEN $3::int IS NULL THEN NULL
                                               ELSE now() - make_interval(days => $3::int) END
      WHERE id = $1`,
    [userId, days, noticeDays ?? null],
  );
}

async function exists(userId: string): Promise<boolean> {
  const { rows } = await admin.query('SELECT 1 FROM users WHERE id = $1', [userId]);
  return rows.length === 1;
}

const noticesTo = (email: string) =>
  t.mail.outbox.filter((m) => m.to === email && m.template === 'onboarding-expiry-notice');

beforeAll(async () => {
  admin = await connectAdmin();
  await truncateAll(admin);
  db = runtimeDb();
  t = createTestAuth(db);
  storageDir = await mkdtemp(path.join(os.tmpdir(), 'hm-7b-'));
  storage = new LocalStorageProvider(storageDir);
});

afterAll(async () => {
  await db.$disconnect();
  await admin.end();
  await rm(storageDir, { recursive: true, force: true });
});

describe('saída antes de concluir o onboarding (P7-M2)', () => {
  it('quem só confirmou o e-mail exclui a conta com a senha; a purga roda no worker', async () => {
    const u = await createVerifiedUser(t);
    expect(await privacy().deleteAccount(u.userId, { password: 'senha errada' })).toBe(
      'invalid_credentials',
    );
    expect(await privacy().deleteAccount(u.userId, { password: PASSWORD })).toBe('deleted');
    expect(await t.service.resolveSession(u.token)).toBeNull();
    expect(t.mail.outbox.some((m) => m.to === u.email && m.template === 'account-deleted')).toBe(
      true,
    );
    expect(await privacy().purgeAccount(u.userId)).toBe('purged');
    expect(await exists(u.userId)).toBe(false);
  });

  it('quem só confirmou o e-mail encerra a conta por ser menor', async () => {
    const u = await createVerifiedUser(t);
    expect(await privacy().closeMinorAccount(u.userId, PASSWORD)).toBe('closed');
    expect(await exists(u.userId)).toBe(false);
  });
});

describe('contas que não concluem o onboarding (P7-M2)', () => {
  it('aviso no 23º dia, uma vez só, com a data e os links; AuditLog sem ator nem conteúdo', async () => {
    const early = await createVerifiedUser(t);
    const due = await createVerifiedUser(t);
    const done = await onboarded();
    await age(early.userId, 22);
    await age(due.userId, 24);
    await age(done.userId, 40);

    const logs: LogRecord[] = [];
    expect(await privacy({}, logs).sendOnboardingExpiryNotices()).toBe(1);
    expect(noticesTo(early.email)).toHaveLength(0);
    expect(noticesTo(done.email)).toHaveLength(0);
    const [notice] = noticesTo(due.email);
    expect(Object.keys(notice?.params ?? {}).sort()).toEqual(['date', 'exitUrl', 'url']);
    expect(notice?.params.exitUrl).toBe('http://localhost:3000/boas-vindas/encerrar-conta');
    expect(JSON.stringify(logs)).not.toContain(due.email);
    expect(JSON.stringify(logs)).not.toContain(due.userId);

    const { rows } = await admin.query(
      `SELECT actor_user_id, resource_id, operator_role FROM audit_logs
        WHERE subject_user_id = $1 AND action = 'onboarding_expiry_notice_sent'`,
      [due.userId],
    );
    expect(rows).toEqual([{ actor_user_id: null, resource_id: null, operator_role: null }]);

    expect(await privacy().sendOnboardingExpiryNotices()).toBe(0);
    expect(noticesTo(due.email)).toHaveLength(1);
  });

  it('falha no envio não marca o aviso; sem aviso, a conta não é excluída', async () => {
    const u = await createVerifiedUser(t);
    await age(u.userId, 40);
    const failing: MailProvider = {
      id: 'falha',
      send: async () => {
        throw new Error('smtp');
      },
    };
    expect(await privacy({ mail: failing }).sendOnboardingExpiryNotices()).toBe(0);
    expect(await privacy().purgeExpiredOnboarding()).toBe(0);
    expect(await exists(u.userId)).toBe(true);
    // O próximo envio dá certo: a exclusão espera mais 7 dias a partir dele.
    expect(await privacy().sendOnboardingExpiryNotices()).toBeGreaterThanOrEqual(1);
    expect(await privacy().purgeExpiredOnboarding()).toBe(0);
    expect(await exists(u.userId)).toBe(true);
  });

  it('exclui 30 dias após o cadastro e 7 após o aviso; preserva quem concluiu, AuditLog sem pessoa', async () => {
    const gone = await createVerifiedUser(t);
    const recentNotice = await createVerifiedUser(t);
    const done = await onboarded();
    await age(gone.userId, 31, 8);
    await age(recentNotice.userId, 31, 3);
    await age(done.userId, 60, 30);
    // Job da pessoa na fila: sai junto (P7-N2).
    await admin.query(
      `INSERT INTO job_queue (id, name, payload, run_at, max_attempts, updated_at)
       VALUES (gen_random_uuid(), 'test.pessoa', jsonb_build_object('userId', $1::text), now(), 3, now())`,
      [gone.userId],
    );
    const before = await admin.query(
      `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'account_expired_onboarding'`,
    );

    expect(await privacy().purgeExpiredOnboarding()).toBe(1);
    expect(await exists(gone.userId)).toBe(false);
    expect(await exists(recentNotice.userId)).toBe(true);
    expect(await exists(done.userId)).toBe(true);
    const jobs = await admin.query(`SELECT 1 FROM job_queue WHERE payload ->> 'userId' = $1`, [
      gone.userId,
    ]);
    expect(jobs.rows).toHaveLength(0);
    const { rows } = await admin.query(
      `SELECT actor_user_id, subject_user_id, resource_id FROM audit_logs
        WHERE action = 'account_expired_onboarding' ORDER BY created_at DESC`,
    );
    expect(rows.length).toBe(before.rows[0].n + 1);
    expect(rows[0]).toEqual({ actor_user_id: null, subject_user_id: null, resource_id: null });
  });

  it('pedido do titular aberto segura a exclusão automática (revisão B3 da 7b)', async () => {
    const u = await createVerifiedUser(t);
    await age(u.userId, 31, 8);
    await admin.query(
      `INSERT INTO privacy_requests (id, user_id, kind, status, due_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'confirmation_access', 'open', now() + interval '10 days', now())`,
      [u.userId],
    );
    await privacy().purgeExpiredOnboarding();
    expect(await exists(u.userId)).toBe(true);
    await admin.query(
      `UPDATE privacy_requests SET status = 'completed', closed_at = now() WHERE user_id = $1`,
      [u.userId],
    );
    await privacy().purgeExpiredOnboarding();
    expect(await exists(u.userId)).toBe(false);
  });

  it('o runtime web não executa o expurgo nem a lista de avisos (só o app_worker)', async () => {
    await expect(db.$queryRaw`SELECT app.onboarding_expired_purge(10)`).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.$queryRaw`SELECT * FROM app.onboarding_expiry_notices_due(10)`).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('purga e AuditLog (P7-B1, P7-N2, PR1b-B2, PR1b-B8)', () => {
  it('a purga exige pedido de exclusão em andamento, mesmo com deleted_at gravado por fora', async () => {
    const u = await onboarded();
    await admin.query('UPDATE users SET deleted_at = now() WHERE id = $1', [u.userId]);
    await expect(
      withUserOn(workerDb(), u.userId, (tx) => tx.$queryRaw`SELECT app.account_purge()`),
    ).rejects.toThrow(/deletion request/);
    expect(await exists(u.userId)).toBe(true);
    await admin.query('UPDATE users SET deleted_at = NULL WHERE id = $1', [u.userId]);
  });

  it('a varredura pula a conta cuja purga falhou de vez e entrega as outras', async () => {
    const a = await onboarded();
    const b = await onboarded();
    expect(await privacy().deleteAccount(a.userId, { password: PASSWORD })).toBe('deleted');
    expect(await privacy().deleteAccount(b.userId, { password: PASSWORD })).toBe('deleted');
    await admin.query(
      `INSERT INTO job_queue (id, name, payload, run_at, status, attempts, max_attempts, updated_at)
       VALUES (gen_random_uuid(), 'privacy.account_purge', jsonb_build_object('userId', $1::text),
               now(), 'failed', 3, 3, now())`,
      [a.userId],
    );
    const due = await privacy().duePurges();
    expect(due).not.toContain(a.userId);
    expect(due).toContain(b.userId);
    expect(await privacy().purgeAccount(a.userId)).toBe('purged');
    expect(await privacy().purgeAccount(b.userId)).toBe('purged');
  });

  it('ação "do sistema" só pela função própria e só da lista fechada', async () => {
    const u = await onboarded();
    await expect(
      withUserOn(
        db,
        u.userId,
        (tx) =>
          tx.$executeRaw`SELECT app.audit_append_system('consent_revoked', 'consent_record', NULL)`,
      ),
    ).rejects.toThrow(/not a system action/);
    await expect(
      withUserOn(
        db,
        u.userId,
        (tx) =>
          tx.$executeRaw`SELECT app.audit_append('consent_revoked', 'consent_record', NULL, true)`,
      ),
    ).rejects.toThrow();
  });
});

describe('atendimento pelo encarregado com o papel de quem atendeu (OI-34 b, ADR-0037)', () => {
  let operator: pg.Client;
  const operatorRole = () =>
    decodeURIComponent(new URL(process.env.TEST_OPERATOR_DATABASE_URL ?? '').username);

  beforeAll(async () => {
    const url = process.env.TEST_OPERATOR_DATABASE_URL;
    assertDisposableDatabase(url);
    operator = new pg.Client({ connectionString: url });
    await operator.connect();
  });

  afterAll(async () => {
    await operator.end();
  });

  it('registra o pedido recebido fora do app, idempotente, com prazo a partir do recebimento', async () => {
    const u = await onboarded();
    const received = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const first = await operator.query(
      `SELECT app.operator_request_register($1, 'correction', $2) AS id`,
      [`  ${u.email.toUpperCase()} `, received],
    );
    const id = first.rows[0].id as string;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const again = await operator.query(
      `SELECT app.operator_request_register($1, 'correction', now()) AS id`,
      [u.email],
    );
    expect(again.rows[0].id).toBe(id);
    const { rows } = await admin.query(
      `SELECT r.status, round(extract(epoch FROM r.due_at - $2::timestamptz) / 86400) AS days,
              a.operator_role, a.actor_user_id
         FROM privacy_requests r JOIN audit_logs a ON a.resource_id = r.id
        WHERE r.id = $1 AND a.action = 'privacy_request_registered'`,
      [id, received],
    );
    expect(rows).toEqual([
      { status: 'open', days: '15', operator_role: operatorRole(), actor_user_id: null },
    ]);
    const none = await operator.query(
      `SELECT app.operator_request_register('ninguem@exemplo.test', 'correction', now()) AS id`,
    );
    expect(none.rows[0].id).toBeNull();
    await expect(
      operator.query(
        `SELECT app.operator_request_register($1, 'correction', now() - interval '20 days')`,
        [u.email],
      ),
    ).rejects.toThrow(/invalid request arguments/);
  });

  it('exclusão pedida fora do app: corta o acesso, a varredura purga e o AuditLog diz quem atendeu', async () => {
    const u = await onboarded();
    const reg = await operator.query(
      `SELECT app.operator_request_register($1, 'deletion', now()) AS id`,
      [u.email],
    );
    const requestId = reg.rows[0].id as string;
    const del = await operator.query('SELECT app.operator_account_delete($1) AS ok', [requestId]);
    expect(del.rows[0].ok).toBe(true);
    expect(await t.service.resolveSession(u.token)).toBeNull();
    // Depois do corte, não dá para recusar nem concluir à mão: quem conclui é a purga.
    const close = await operator.query(`SELECT app.operator_request_close($1, 'rejected') AS ok`, [
      requestId,
    ]);
    expect(close.rows[0].ok).toBe(false);
    expect(await privacy().duePurges()).toContain(u.userId);
    expect(await privacy().purgeAccount(u.userId)).toBe('purged');
    const { rows } = await admin.query(
      `SELECT r.status, (SELECT operator_role FROM audit_logs
                          WHERE action = 'account_deleted' AND resource_id = r.id) AS operator_role
         FROM privacy_requests r WHERE r.id = $1`,
      [requestId],
    );
    expect(rows[0]).toEqual({ status: 'completed', operator_role: operatorRole() });
  });

  it('pedido de exclusão ainda aberto pode ser recusado (identidade não confirmada)', async () => {
    const u = await onboarded();
    const reg = await operator.query(
      `SELECT app.operator_request_register($1, 'minor_closure', now()) AS id`,
      [u.email],
    );
    const close = await operator.query(`SELECT app.operator_request_close($1, 'rejected') AS ok`, [
      reg.rows[0].id,
    ]);
    expect(close.rows[0].ok).toBe(true);
    expect(await exists(u.userId)).toBe(true);
  });

  it('a leitura do contato grava quem leu e tem teto por hora', async () => {
    const u = await onboarded();
    const r = await privacy().openRequest(u.userId, 'correction');
    if (r.status !== 'ok') throw new Error('pedido');
    await operator.query('SELECT app.operator_request_contact($1)', [r.request.id]);
    const { rows } = await admin.query(
      `SELECT operator_role FROM audit_logs WHERE action = 'privacy_request_contact_read'
        AND resource_id = $1`,
      [r.request.id],
    );
    expect(rows).toEqual([{ operator_role: operatorRole() }]);
    await admin.query(
      `INSERT INTO audit_logs (id, action, resource_type, operator_role, created_at, updated_at)
       SELECT gen_random_uuid(), 'privacy_request_contact_read', 'privacy_request', $1, now(), now()
         FROM generate_series(1, 30)`,
      [operatorRole()],
    );
    try {
      await expect(
        operator.query('SELECT app.operator_request_contact($1)', [r.request.id]),
      ).rejects.toThrow(/contact read rate exceeded/);
    } finally {
      await admin.query(
        `DELETE FROM audit_logs WHERE action = 'privacy_request_contact_read' AND subject_user_id IS NULL`,
      );
    }
  });

  it('o grupo app_operator não entra no banco; o runtime não chama as funções do operador', async () => {
    const { rows } = await admin.query(
      `SELECT rolcanlogin FROM pg_roles WHERE rolname = 'app_operator'`,
    );
    expect(rows).toEqual([{ rolcanlogin: false }]);
    await expect(
      db.$queryRaw`SELECT app.operator_request_register('x@exemplo.test', 'correction', now())`,
    ).rejects.toThrow(/permission denied/);
  });
});

describe('revisão da 7b: purga parada e marca de arquivo (B4, B5)', () => {
  it('exclusão em andamento há mais de 1 hora entra na contagem de purgas paradas, sem IDs no log', async () => {
    const u = await createVerifiedUser(t);
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO privacy_requests (id, user_id, kind, status, due_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'deletion', 'in_progress', now() + interval '10 days',
               now() - interval '2 hours') RETURNING id`,
      [u.userId],
    );
    const logs: LogRecord[] = [];
    const out = await privacy({}, logs).requestDeadlines();
    expect(out.stalled).toBeGreaterThanOrEqual(1);
    expect(logs.map((l) => l.event)).toContain('privacy.closures_stalled');
    expect(JSON.stringify(logs)).not.toContain(u.userId);
    expect(JSON.stringify(logs)).not.toContain(rows[0]?.id ?? 'x');
  });

  it('o runtime só marca como apagado o arquivo de exportação da própria pessoa', async () => {
    const owner = await createVerifiedUser(t);
    const other = await createVerifiedUser(t);
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO data_export_jobs (id, user_id, kind, format, status, expires_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'full_export', 'json', 'queued', NULL, now())
       RETURNING id`,
      [owner.userId],
    );
    const id = rows[0]?.id ?? '';
    // Nasce na fila (gatilho); depois vence como qualquer pedido.
    await admin.query(`UPDATE data_export_jobs SET status = 'expired' WHERE id = $1`, [id]);
    const mark = (userId: string) =>
      withUserOn(
        db,
        userId,
        (tx) =>
          tx.$queryRaw<
            Array<{ ok: boolean }>
          >`SELECT app.exports_mark_file_deleted(${id}::uuid) AS ok`,
      );
    expect((await mark(other.userId))[0]?.ok).toBe(false);
    expect((await mark(owner.userId))[0]?.ok).toBe(true);
  });
});
