import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { MemoryJobQueue } from '@/adapters/jobs/memory';
import { LocalKmsProvider } from '@/adapters/kms/local';
import { LocalStorageProvider } from '@/adapters/storage/local';
import type { Db } from '@/lib/db/client';
import { withUserOn } from '@/lib/db/rls';
import { createLogger, type LogRecord } from '@/lib/logger';
import { createActivityService } from '@/modules/activity/service';
import { base32Decode, totpAt } from '@/modules/auth/totp';
import { createBodyService } from '@/modules/body/service';
import { withConsentOn } from '@/modules/consent/guard';
import { goalInputSchema } from '@/modules/goals';
import { createGoalsService } from '@/modules/goals/service';
import { createHabitsService } from '@/modules/habits/service';
import { createFieldCipher, type HealthDeps } from '@/modules/health/core';
import { HEALTH_DATA_ERASERS } from '@/modules/health/erasers';
import { createOwnSource } from '@/modules/health/server';
import { reminderInputSchema } from '@/modules/notifications';
import { createRemindersService } from '@/modules/notifications/service';
import { createNutritionService } from '@/modules/nutrition/service';
import { createHealthDataEliminator } from '@/modules/privacy/health-data';
import { registerPrivacyJobs, schedulePrivacyJobs } from '@/modules/privacy/jobs';
import { createPrivacyService, type PrivacyDeps } from '@/modules/privacy/service';
import { createReportsService } from '@/modules/reports/service';
import { eraseUserExports, exportPrefix } from '@/modules/reports/storage';
import { createSleepService } from '@/modules/sleep/service';
import { createTestConsent } from './consent-helpers';
import {
  connectAdmin,
  createTestAuth,
  createVerifiedUser,
  META,
  PASSWORD,
  runtimeDb,
  truncateAll,
  type TestAuth,
} from './helpers';
import { assertDisposableDatabase } from './safety';

/**
 * Direitos do titular e exclusão de conta (Fase 6b, ADR-0034; LEG-D01, D04, D06, D07, R03, S06): pedidos pela
 * função do banco (idempotência, concorrência, teto, atendimento automático, recibo), exclusão com
 * reautenticação (senha + 2º fator, prova de uso único), purga imediata (tabelas, arquivos, provas mínimas,
 * AuditLog só com enums e UUIDs) e o papel `app_operator`. Dados 100% sintéticos.
 */
let admin: pg.Client;
let db: Db;
let t: TestAuth;
let deps: HealthDeps;
let kms: LocalKmsProvider;
let storageDir: string;
let storage: LocalStorageProvider;
const TZ = 'America/Sao_Paulo';
const SECRET_NOTE = 'nota-secreta-sintetica-exclusao';
const SECRET_MEAL = 'refeicao-secreta-sintetica-exclusao';
const silent = createLogger({ sink: () => {} });

/** Provas e registros que ficam depois da purga (sem FK para users, LEG-R03/R02). */
const KEPT_AFTER_PURGE = new Set([
  'consent_records',
  'policy_acceptances',
  'privacy_requests',
  'access_logs',
]);

function reports() {
  return createReportsService({
    db,
    kms,
    storage,
    queue: { enqueue: async () => 'job' },
    logger: silent,
    sourceFor: (userId) =>
      createOwnSource(userId, deps, (u, fn) => withConsentOn(db, u, 'health_data', fn)),
    render: {
      notice: () => 'Gerado em 07/10/2026. Material de autoacompanhamento.',
      reportPdf: async () => {
        throw new Error('não usado');
      },
      reportJson: () => {
        throw new Error('não usado');
      },
      reportCsv: () => {
        throw new Error('não usado');
      },
    },
    linkHours: 24,
    timeZone: TZ,
    today: () => '2026-10-07',
  });
}

function privacy(overrides: Partial<PrivacyDeps> = {}, logs?: LogRecord[]) {
  const logger = logs ? createLogger({ minLevel: 'debug', sink: (r) => logs.push(r) }) : silent;
  return createPrivacyService({
    db,
    logger,
    reauthenticate: (userId, password, purpose, mfaCode) =>
      t.service.issueReauthProof(userId, password, purpose, mfaCode),
    accessLogRetentionDays: 180,
    proofRetentionDays: 1825,
    backupRetentionDays: 30,
    erasers: HEALTH_DATA_ERASERS,
    eraseObjects: (userId) => eraseUserExports(storage, userId),
    mail: t.mail,
    queue: new MemoryJobQueue(silent),
    requestFullExport: async (userId) =>
      (await reports().request(userId, { kind: 'full_export', format: 'json' })).status ===
      'queued',
    appUrl: 'http://localhost:3000',
    timeZone: TZ,
    ...overrides,
  });
}

async function person(purposes: Array<'health_data' | 'marketing'> = ['health_data']) {
  const u = await createVerifiedUser(t);
  const c = createTestConsent(db, t.clock);
  expect(
    await c.service.completeOnboarding(u.userId, {
      acceptTerms: true,
      acceptPrivacy: true,
      purposes,
    }),
  ).toEqual({ ok: true });
  expect(await c.service.chooseDataMode(u.userId, 'own')).toBe(true);
  return u;
}

/** Um registro em cada tabela de saúde, pelos serviços reais. */
async function seedAll(userId: string) {
  const sleep = await createSleepService(deps).create(userId, {
    bedAt: '2026-10-05T23:00',
    wakeAt: '2026-10-06T07:00',
    quality: 4,
    awakenings: 1,
    note: SECRET_NOTE,
  });
  const habits = createHabitsService(deps);
  const habitId = await habits.create(userId, {
    name: 'habito-sintetico',
    frequency: 'daily',
    weekdays: [],
    timesPerWeek: null,
  });
  expect(await habits.setCheck(userId, habitId, '2026-10-06', true)).toBe('ok');
  const body = await createBodyService(deps).create(userId, {
    measuredAt: '2026-10-06T08:00',
    weightKg: 70,
  });
  const nutrition = createNutritionService(deps);
  const meal = await nutrition.createMeal(userId, {
    eatenAt: '2026-10-06T12:30',
    category: 'lunch',
    description: SECRET_MEAL,
  });
  const water = await nutrition.addWater(userId, { day: '2026-10-06', ml: 300 });
  const activity = await createActivityService(deps).create(userId, {
    startedAt: '2026-10-06T18:00',
    type: 'strength',
    durationMin: 40,
    sets: [{ exercise: 'exercicio-sintetico', reps: 10, loadKg: 20 }],
  });
  const goal = await createGoalsService(deps).create(
    userId,
    goalInputSchema.parse({ metric: 'habit_completion_pct', targetValue: '80', habitId }),
  );
  const reminder = await createRemindersService(deps).create(
    userId,
    reminderInputSchema.parse({ kind: 'habit', habitId, time: '21:00' }),
  );
  if (!sleep.ok || !body.ok || !meal.ok || !water.ok || !activity.ok || !goal.ok || !reminder.ok) {
    throw new Error('seed');
  }
}

/** Gera uma exportação completa de verdade (arquivo cifrado no storage). */
async function readyExport(userId: string): Promise<string> {
  const r = reports();
  const out = await r.request(userId, { kind: 'full_export', format: 'json' });
  if (out.status !== 'queued') throw new Error(`exportação: ${out.status}`);
  expect(await r.generate(userId, out.jobId)).toBe('ready');
  return out.jobId;
}

async function enableMfa(userId: string): Promise<Buffer> {
  const setup = await t.service.startTotpSetup(userId, PASSWORD);
  if (!setup.ok) throw new Error('setup');
  const secret = base32Decode(setup.manualKey);
  const confirm = await t.service.confirmTotpSetup(
    userId,
    '',
    totpAt(secret, t.clock.now.getTime()),
  );
  if (!confirm.ok) throw new Error('confirm');
  // Próximo passo do TOTP: o código da ativação não vale de novo (anti-replay).
  t.clock.now = new Date(t.clock.now.getTime() + 31_000);
  return secret;
}

async function tablesWithUserId(): Promise<string[]> {
  const { rows } = await admin.query<{ relname: string }>(
    `SELECT c.relname FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attname = 'user_id' AND NOT a.attisdropped
      ORDER BY 1`,
  );
  return rows.map((r) => r.relname);
}

async function rowsOf(userId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of await tablesWithUserId()) {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public."${table}" WHERE user_id = $1`,
      [userId],
    );
    out[table] = rows[0]?.n ?? -1;
  }
  const users = await admin.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM users WHERE id = $1',
    [userId],
  );
  out.users = users.rows[0]?.n ?? -1;
  return out;
}

async function audit(userId: string): Promise<Array<{ action: string; actor: string | null }>> {
  const { rows } = await admin.query<{ action: string; actor: string | null }>(
    `SELECT action::text, actor_user_id AS actor FROM audit_logs WHERE subject_user_id = $1
      ORDER BY created_at, action::text`,
    [userId],
  );
  return rows;
}

beforeAll(async () => {
  admin = await connectAdmin();
  await truncateAll(admin);
  db = runtimeDb();
  t = createTestAuth(db);
  kms = new LocalKmsProvider(randomBytes(32).toString('base64'));
  storageDir = await mkdtemp(path.join(os.tmpdir(), 'hm-rights-'));
  storage = new LocalStorageProvider(storageDir);
  deps = {
    run: (userId, fn) => withConsentOn(db, userId, 'health_data', fn),
    cipher: createFieldCipher(kms),
    timeZone: TZ,
    now: () => new Date('2026-10-07T15:00:00Z'),
  };
});

afterAll(async () => {
  await db.$disconnect();
  await admin.end();
  await rm(storageDir, { recursive: true, force: true });
});

describe('pedidos do titular (LEG-D07)', () => {
  it('confirmação e compartilhamento são atendidos na hora, com prazo de 15 dias e AuditLog', async () => {
    const u = await person();
    for (const kind of ['confirmation_access', 'sharing_info'] as const) {
      const r = await privacy().openRequest(u.userId, kind);
      if (r.status !== 'ok') throw new Error('pedido');
      expect(r.created).toBe(true);
      expect(r.request.status).toBe('completed');
      const days = (r.request.dueAt.getTime() - r.request.createdAt.getTime()) / 86_400_000;
      expect(Math.round(days)).toBe(15);
      const row = await admin.query(
        'SELECT closed_at IS NOT NULL AS closed FROM privacy_requests WHERE id = $1',
        [r.request.id],
      );
      expect(row.rows[0].closed).toBe(true);
    }
    const actions = (await audit(u.userId)).filter((a) => a.action.startsWith('privacy_request'));
    expect(actions).toEqual([
      { action: 'privacy_request_closed', actor: null },
      { action: 'privacy_request_created', actor: u.userId },
      { action: 'privacy_request_closed', actor: null },
      { action: 'privacy_request_created', actor: u.userId },
    ]);
  });

  it('recibo por e-mail só com protocolo, tipo, data, prazo e link; sem conteúdo de saúde', async () => {
    const u = await person();
    await seedAll(u.userId);
    const r = await privacy().openRequest(u.userId, 'correction');
    if (r.status !== 'ok') throw new Error('pedido');
    const mails = t.mail.outbox.filter(
      (m) => m.to === u.email && m.template === 'privacy-request-received',
    );
    expect(mails).toHaveLength(1);
    expect(Object.keys(mails[0]?.params ?? {}).sort()).toEqual([
      'dueAt',
      'kind',
      'openedAt',
      'protocol',
      'url',
    ]);
    expect(mails[0]?.params.protocol).toBe(r.request.id);
    const text = JSON.stringify(mails[0]);
    expect(text).not.toContain(SECRET_NOTE);
    expect(text).not.toContain(SECRET_MEAL);
  });

  it('é idempotente com pedido aberto do mesmo tipo (sem segundo recibo)', async () => {
    const u = await person();
    const a = await privacy().openRequest(u.userId, 'anonymization');
    const b = await privacy().openRequest(u.userId, 'anonymization');
    if (a.status !== 'ok' || b.status !== 'ok') throw new Error('pedido');
    expect(b.request.id).toBe(a.request.id);
    expect([a.created, b.created]).toEqual([true, false]);
    expect(a.request.status).toBe('open');
    const mails = t.mail.outbox.filter(
      (m) => m.to === u.email && m.template === 'privacy-request-received',
    );
    expect(mails).toHaveLength(1);
  });

  it('pedidos simultâneos do mesmo tipo criam uma só linha (trava por pessoa)', async () => {
    const u = await person();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => privacy().openRequest(u.userId, 'correction')),
    );
    const ids = new Set(results.map((r) => (r.status === 'ok' ? r.request.id : 'x')));
    expect(ids.size).toBe(1);
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM privacy_requests WHERE user_id = $1 AND kind = 'correction'`,
      [u.userId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('teto de 10 pedidos novos em 24 h', async () => {
    const u = await person();
    for (let i = 0; i < 10; i++) {
      expect((await privacy().openRequest(u.userId, 'confirmation_access')).status).toBe('ok');
    }
    expect(await privacy().openRequest(u.userId, 'sharing_info')).toEqual({
      status: 'rate_limited',
    });
  });

  it('o banco recusa tipo de sistema, pedido sem contexto e escrita direta', async () => {
    const u = await person();
    await expect(
      withUserOn(
        db,
        u.userId,
        (tx) => tx.$queryRaw`SELECT * FROM app.privacy_request_open('deletion')`,
      ),
    ).rejects.toThrow(/invalid privacy request kind/);
    await expect(
      db.$queryRaw`SELECT * FROM app.privacy_request_open('correction')`,
    ).rejects.toThrow(/requires user context/);
    await expect(
      withUserOn(
        db,
        u.userId,
        (
          tx,
        ) => tx.$executeRaw`INSERT INTO privacy_requests (id, user_id, kind, status, due_at, updated_at)
          VALUES (gen_random_uuid(), ${u.userId}::uuid, 'correction', 'open', now(), now())`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('portabilidade: pede a cópia completa e conclui quando ela fica pronta', async () => {
    const u = await person();
    await seedAll(u.userId);
    const r = await privacy().openRequest(u.userId, 'portability');
    if (r.status !== 'ok') throw new Error('pedido');
    expect(r.request.status).toBe('in_progress');
    const { rows: jobs } = await admin.query<{ id: string }>(
      `SELECT id FROM data_export_jobs WHERE user_id = $1 AND kind = 'full_export' AND status = 'queued'`,
      [u.userId],
    );
    expect(jobs).toHaveLength(1);
    expect(await reports().generate(u.userId, jobs[0]?.id ?? '')).toBe('ready');
    const { rows } = await admin.query(
      'SELECT status, closed_at IS NOT NULL AS closed FROM privacy_requests WHERE id = $1',
      [r.request.id],
    );
    expect(rows[0]).toEqual({ status: 'completed', closed: true });
    // Com uma cópia pronta, um novo pedido já nasce concluído.
    const again = await privacy().openRequest(u.userId, 'portability');
    expect(again.status === 'ok' && again.request.status).toBe('completed');
  });

  it('portabilidade sem autorização nem carência fica aberta para o encarregado', async () => {
    const u = await person(['marketing']);
    const r = await privacy().openRequest(u.userId, 'portability');
    expect(r.status === 'ok' && r.request.status).toBe('in_progress');
  });

  it('prazos: o job registra só as contagens', async () => {
    const u = await person();
    const r = await privacy().openRequest(u.userId, 'correction');
    if (r.status !== 'ok') throw new Error('pedido');
    await admin.query(
      `UPDATE privacy_requests SET due_at = now() - interval '1 day' WHERE id = $1`,
      [r.request.id],
    );
    const logs: LogRecord[] = [];
    const out = await privacy({}, logs).requestDeadlines();
    expect(out.overdue).toBeGreaterThanOrEqual(1);
    expect(logs.map((l) => l.event)).toContain('privacy.requests_overdue');
    expect(JSON.stringify(logs)).not.toContain(u.userId);
    expect(JSON.stringify(logs)).not.toContain(r.request.id);
  });
});

describe('exclusão de conta (LEG-D04)', () => {
  it('senha errada não exclui nada', async () => {
    const u = await person();
    expect(await privacy().deleteAccount(u.userId, { password: 'senha errada sintética' })).toBe(
      'invalid_credentials',
    );
    const { rows } = await admin.query('SELECT deleted_at FROM users WHERE id = $1', [u.userId]);
    expect(rows[0].deleted_at).toBeNull();
    expect(await t.service.resolveSession(u.token)).not.toBeNull();
  });

  it('corta o acesso na hora: sessão inválida, login recusado, consentimentos revogados', async () => {
    const u = await person(['health_data', 'marketing']);
    const queue = new MemoryJobQueue(silent);
    const enqueued: string[] = [];
    queue.register('privacy.account_purge', async (p) => {
      enqueued.push(String(p.userId));
    });
    expect(await privacy({ queue }).deleteAccount(u.userId, { password: PASSWORD })).toBe(
      'deleted',
    );
    expect(await t.service.resolveSession(u.token)).toBeNull();
    expect(await t.service.login({ email: u.email, password: PASSWORD }, META)).toEqual({
      ok: false,
      error: 'invalid_credentials',
    });
    const { rows } = await admin.query(
      `SELECT (SELECT deleted_at IS NOT NULL FROM users WHERE id = $1) AS deleted,
              (SELECT count(*) FROM consent_records WHERE user_id = $1 AND revoked_at IS NULL)::int AS active,
              (SELECT count(*) FROM sessions WHERE user_id = $1 AND revoked_at IS NULL)::int AS sessions`,
      [u.userId],
    );
    expect(rows[0]).toEqual({ deleted: true, active: 0, sessions: 0 });
    const req = await admin.query(
      `SELECT status FROM privacy_requests WHERE user_id = $1 AND kind = 'deletion'`,
      [u.userId],
    );
    expect(req.rows).toEqual([{ status: 'in_progress' }]);
    await queue.drain();
    expect(enqueued).toEqual([u.userId]);
  });

  it('com MFA ligado, sem o código ou com código errado é recusado; com o TOTP, exclui', async () => {
    const u = await person();
    const secret = await enableMfa(u.userId);
    expect(await privacy().deleteAccount(u.userId, { password: PASSWORD })).toBe(
      'invalid_credentials',
    );
    expect(await privacy().deleteAccount(u.userId, { password: PASSWORD, mfaCode: '000000' })).toBe(
      'invalid_credentials',
    );
    const code = totpAt(secret, t.clock.now.getTime());
    expect(
      await privacy().deleteAccount(u.userId, {
        password: 'senha errada sintética',
        mfaCode: code,
      }),
    ).toBe('invalid_credentials');
    expect(await privacy().deleteAccount(u.userId, { password: PASSWORD, mfaCode: code })).toBe(
      'deleted',
    );
  });

  it('prova vencida, reutilizada ou de outro propósito é recusada pelo banco', async () => {
    const u = await person();
    const hash = (nonce: string) => new Uint8Array(createHash('sha256').update(nonce).digest());
    const call = (nonce: string) =>
      withUserOn(
        db,
        u.userId,
        (tx) => tx.$queryRaw`SELECT app.account_delete(${hash(nonce)})::text`,
      );
    const minor = await t.service.issueReauthProof(u.userId, PASSWORD, 'minor_closure');
    await expect(call(minor ?? '')).rejects.toThrow(/reauthentication required/);
    const expired = await t.service.issueReauthProof(u.userId, PASSWORD, 'account_deletion');
    await admin.query(
      `UPDATE reauth_proofs SET expires_at = now() - interval '1 second' WHERE user_id = $1`,
      [u.userId],
    );
    await expect(call(expired ?? '')).rejects.toThrow(/reauthentication required/);
    const ok = await t.service.issueReauthProof(u.userId, PASSWORD, 'account_deletion');
    await call(ok ?? '');
    await expect(call(ok ?? '')).rejects.toThrow(/reauthentication required/);
  });

  it('só exclui a própria conta (contexto da transação)', async () => {
    const a = await person();
    const b = await person();
    expect(await privacy().deleteAccount(a.userId, { password: PASSWORD })).toBe('deleted');
    const { rows } = await admin.query('SELECT deleted_at FROM users WHERE id = $1', [b.userId]);
    expect(rows[0].deleted_at).toBeNull();
  });
});

describe('purga da conta excluída (LEG-D04, LEG-R03)', () => {
  it('apaga tabelas, arquivos e a conta; ficam só as provas; AuditLog só com enums e UUIDs', async () => {
    const u = await person();
    await seedAll(u.userId);
    await readyExport(u.userId);
    await privacy().openRequest(u.userId, 'correction');
    expect((await readdir(path.join(storageDir, exportPrefix(u.userId)))).length).toBeGreaterThan(
      0,
    );
    const logs: LogRecord[] = [];
    const svc = privacy({}, logs);
    expect(await svc.deleteAccount(u.userId, { password: PASSWORD })).toBe('deleted');
    expect(await svc.purgeAccount(u.userId)).toBe('purged');

    const counts = await rowsOf(u.userId);
    for (const [table, n] of Object.entries(counts)) {
      if (!KEPT_AFTER_PURGE.has(table)) expect(n, table).toBe(0);
    }
    expect(counts.privacy_requests).toBe(2);
    expect(await storage.exists(`${exportPrefix(u.userId)}/x.bin`)).toBe(false);
    await expect(readdir(path.join(storageDir, exportPrefix(u.userId)))).rejects.toThrow();

    const requests = await admin.query(
      `SELECT kind::text, status::text FROM privacy_requests WHERE user_id = $1 ORDER BY kind::text`,
      [u.userId],
    );
    // Só a exclusão foi atendida; o outro pedido perdeu o objeto e sai como recusado (revisão B4).
    expect(requests.rows).toEqual([
      { kind: 'correction', status: 'rejected' },
      { kind: 'deletion', status: 'completed' },
    ]);
    const accountRows = (await audit(u.userId)).filter((a) => a.action.startsWith('account_'));
    expect(accountRows).toEqual([
      { action: 'account_deleted', actor: null },
      { action: 'account_deletion_requested', actor: u.userId },
      { action: 'account_deletion_notice_sent', actor: null },
      { action: 'account_purged', actor: null },
    ]);
    // AuditLog e logs da aplicação: nada de e-mail, conteúdo ou contagem de registros.
    const all = await admin.query('SELECT * FROM audit_logs WHERE subject_user_id = $1', [
      u.userId,
    ]);
    expect(JSON.stringify(all.rows)).not.toContain(u.email);
    const text = JSON.stringify(logs);
    for (const secret of [u.email, SECRET_NOTE, SECRET_MEAL]) expect(text).not.toContain(secret);
    const purged = logs.find((l) => l.event === 'privacy.account_purged');
    expect(purged && Object.keys(purged).sort()).toEqual(['event', 'level', 'ts']);

    // Aviso de exclusão: sem dado de saúde nem link de login.
    const notice = t.mail.outbox.find((m) => m.to === u.email && m.template === 'account-deleted');
    expect(Object.keys(notice?.params ?? {}).sort()).toEqual([
      'accessDays',
      'backupDays',
      'contactUrl',
      'date',
      'proofDays',
    ]);
    expect(JSON.stringify(notice)).not.toMatch(/entrar|token|login/);

    // O e-mail fica livre para um novo cadastro.
    const again = await createVerifiedUser(t, u.email);
    expect(again.userId).not.toBe(u.userId);
  });

  it('falha no envio do aviso não segura a purga (log só com o modelo)', async () => {
    const u = await person();
    const logs: LogRecord[] = [];
    const svc = privacy(
      {
        mail: {
          id: 'falha',
          send: async () => {
            throw new Error('smtp fora');
          },
        },
      },
      logs,
    );
    expect(await svc.deleteAccount(u.userId, { password: PASSWORD })).toBe('deleted');
    expect(await svc.purgeAccount(u.userId)).toBe('purged');
    const failed = logs.find((l) => l.event === 'mail.failed');
    expect(failed && Object.keys(failed).sort()).toEqual(['event', 'level', 'template', 'ts']);
    expect(failed?.template).toBe('account-deleted');
    expect((await audit(u.userId)).map((a) => a.action)).not.toContain(
      'account_deletion_notice_sent',
    );
  });

  it('o aviso sai uma vez só, mesmo com novas tentativas da purga (revisão B1)', async () => {
    const u = await person();
    const failing = privacy({
      eraseObjects: async () => {
        throw new Error('storage fora');
      },
    });
    expect(await failing.deleteAccount(u.userId, { password: PASSWORD })).toBe('deleted');
    await expect(failing.purgeAccount(u.userId)).rejects.toThrow(/storage fora/);
    await expect(failing.purgeAccount(u.userId)).rejects.toThrow(/storage fora/);
    expect(await privacy().purgeAccount(u.userId)).toBe('purged');
    const notices = t.mail.outbox.filter(
      (m) => m.to === u.email && m.template === 'account-deleted',
    );
    expect(notices).toHaveLength(1);
  });

  it('exclusão na carência para a exportação em andamento: nada de saúde é lido (revisão M2)', async () => {
    const u = await person();
    await seedAll(u.userId);
    const consent = createTestConsent(db, t.clock);
    await consent.service.revoke(u.userId, 'health_data');
    const r = reports();
    const out = await r.request(u.userId, { kind: 'full_export', format: 'json' });
    if (out.status !== 'queued') throw new Error(`exportação: ${out.status}`);
    expect(await privacy().deleteAccount(u.userId, { password: PASSWORD })).toBe('deleted');
    expect(await r.generate(u.userId, out.jobId)).toBe('skipped');
    const { rows } = await admin.query(
      `SELECT (SELECT health_data_purge_at FROM users WHERE id = $1) AS purge_at,
              (SELECT status::text FROM data_export_jobs WHERE id = $2) AS status`,
      [u.userId, out.jobId],
    );
    expect(rows[0]).toEqual({ purge_at: null, status: 'expired' });
    expect((await audit(u.userId)).map((a) => a.action)).not.toContain('data_export_health_read');
    await expect(readdir(path.join(storageDir, exportPrefix(u.userId)))).rejects.toThrow();
    await expect(
      withUserOn(db, u.userId, (tx) => tx.$queryRaw`SELECT app.health_grace_active() AS ok`),
    ).resolves.toEqual([{ ok: false }]);
  });

  it('segundo envio da exclusão não quebra (revisão N4)', async () => {
    const u = await person();
    expect(await privacy().deleteAccount(u.userId, { password: PASSWORD })).toBe('deleted');
    // O banco recusa a segunda exclusão (conta já excluída); o serviço responde como concluída.
    expect(await privacy().deleteAccount(u.userId, { password: PASSWORD })).toBe('deleted');
  });

  it('falha no storage desfaz a purga e o job tenta de novo', async () => {
    const u = await person();
    const svc = privacy({
      eraseObjects: async () => {
        throw new Error('storage fora');
      },
    });
    expect(await svc.deleteAccount(u.userId, { password: PASSWORD })).toBe('deleted');
    await expect(svc.purgeAccount(u.userId)).rejects.toThrow(/storage fora/);
    expect((await rowsOf(u.userId)).users).toBe(1);
    expect(await privacy().purgeAccount(u.userId)).toBe('purged');
  });

  it('conta não excluída não é purgada', async () => {
    const u = await person();
    expect(await privacy().purgeAccount(u.userId)).toBe('skipped');
    expect((await rowsOf(u.userId)).users).toBe(1);
    await expect(
      withUserOn(db, u.userId, (tx) => tx.$queryRaw`SELECT app.account_purge()`),
    ).resolves.toEqual([{ account_purge: false }]);
  });

  it('a varredura diária reencontra a conta excluída cuja purga se perdeu', async () => {
    const u = await person();
    // Exclusão com a fila "perdida": nada é enfileirado.
    const lost = { enqueue: async () => 'perdido' };
    expect(await privacy({ queue: lost }).deleteAccount(u.userId, { password: PASSWORD })).toBe(
      'deleted',
    );
    const queue = new MemoryJobQueue(silent);
    registerPrivacyJobs(queue, {
      service: privacy(),
      eliminator: createHealthDataEliminator({
        db,
        logger: silent,
        erasers: HEALTH_DATA_ERASERS,
        eraseObjects: async () => {},
      }),
    });
    await schedulePrivacyJobs(queue);
    await queue.drain(); // recorrentes: a varredura enfileira a purga
    await queue.drain(); // purga
    expect((await rowsOf(u.userId)).users).toBe(0);
  });
});

describe('encerramento de menor (LEG-F04): 2º fator e arquivos', () => {
  it('com MFA ligado, sem o código é recusado; com o TOTP, encerra (revisão M1)', async () => {
    const u = await person();
    const secret = await enableMfa(u.userId);
    expect(await privacy().closeMinorAccount(u.userId, PASSWORD)).toBe('invalid_password');
    expect((await rowsOf(u.userId)).users).toBe(1);
    const code = totpAt(secret, t.clock.now.getTime());
    expect(await privacy().closeMinorAccount(u.userId, PASSWORD, code)).toBe('closed');
    expect((await rowsOf(u.userId)).users).toBe(0);
  });

  it('sem objetos no storage depois do encerramento', async () => {
    const u = await person();
    await seedAll(u.userId);
    await readyExport(u.userId);
    expect(await privacy().closeMinorAccount(u.userId, PASSWORD)).toBe('closed');
    await expect(readdir(path.join(storageDir, exportPrefix(u.userId)))).rejects.toThrow();
  });
});

describe('papel app_operator (atendimento manual)', () => {
  let operator: pg.Client;

  beforeAll(async () => {
    const url = process.env.TEST_OPERATOR_DATABASE_URL;
    assertDisposableDatabase(url);
    operator = new pg.Client({ connectionString: url });
    await operator.connect();
  });

  afterAll(async () => {
    await operator.end();
  });

  it('não lê nenhuma tabela nem chama as funções do runtime', async () => {
    for (const table of [
      'users',
      'sleep_entries',
      'meal_entries',
      'privacy_requests',
      'audit_logs',
    ]) {
      await expect(operator.query(`SELECT 1 FROM public.${table} LIMIT 1`), table).rejects.toThrow(
        /permission denied/,
      );
    }
    await expect(
      operator.query(`SELECT * FROM app.privacy_request_open('correction')`),
    ).rejects.toThrow(/permission denied/);
    await expect(operator.query('SELECT app.account_purge()')).rejects.toThrow(/permission denied/);
    await expect(
      operator.query(`SELECT * FROM app.export_job_health_data(gen_random_uuid())`),
    ).rejects.toThrow(/permission denied/);
  });

  it('lista sem e-mail, lê o contato com AuditLog e fecha só pedidos manuais', async () => {
    const u = await person();
    const r = await privacy().openRequest(u.userId, 'correction');
    if (r.status !== 'ok') throw new Error('pedido');
    const list = await operator.query('SELECT * FROM app.operator_requests_due()');
    expect(Object.keys(list.rows[0] ?? {}).sort()).toEqual([
      'due',
      'kind',
      'opened_at',
      'request_id',
      'status',
    ]);
    expect(JSON.stringify(list.rows)).not.toContain(u.email);
    expect(list.rows.map((row) => row.request_id)).toContain(r.request.id);

    const contact = await operator.query('SELECT app.operator_request_contact($1) AS email', [
      r.request.id,
    ]);
    expect(contact.rows[0].email).toBe(u.email);
    expect((await audit(u.userId)).map((a) => a.action)).toContain('privacy_request_contact_read');

    const closed = await operator.query(
      `SELECT app.operator_request_close($1, 'completed') AS ok`,
      [r.request.id],
    );
    expect(closed.rows[0].ok).toBe(true);
    const again = await operator.query(`SELECT app.operator_request_close($1, 'rejected') AS ok`, [
      r.request.id,
    ]);
    expect(again.rows[0].ok).toBe(false);

    // A exclusão é do sistema: o operador não a fecha.
    expect(await privacy().deleteAccount(u.userId, { password: PASSWORD })).toBe('deleted');
    const { rows } = await admin.query<{ id: string }>(
      `SELECT id FROM privacy_requests WHERE user_id = $1 AND kind = 'deletion'`,
      [u.userId],
    );
    const deletion = await operator.query(
      `SELECT app.operator_request_close($1, 'completed') AS ok`,
      [rows[0]?.id],
    );
    expect(deletion.rows[0].ok).toBe(false);
    // Conta excluída: o contato não é mais entregue.
    const none = await operator.query('SELECT app.operator_request_contact($1) AS email', [
      rows[0]?.id,
    ]);
    expect(none.rows[0].email).toBeNull();
  });
});
