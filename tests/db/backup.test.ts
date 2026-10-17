import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { MemoryJobQueue } from '@/adapters/jobs/memory';
import { LocalKmsProvider } from '@/adapters/kms/local';
import type { Db } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';
import { createBodyService } from '@/modules/body/service';
import { withConsentOn } from '@/modules/consent/guard';
import { createFieldCipher, type HealthDeps } from '@/modules/health/core';
import { HEALTH_DATA_ERASERS } from '@/modules/health/erasers';
import { createNutritionService } from '@/modules/nutrition/service';
import { createHealthDataEliminator } from '@/modules/privacy/health-data';
import { createPrivacyService } from '@/modules/privacy/service';
import { createSleepService } from '@/modules/sleep/service';
import { createTestConsent } from './consent-helpers';
import {
  connectAdmin,
  createTestAuth,
  createVerifiedUser,
  META,
  PASSWORD,
  runtimeDb,
  type TestAuth,
  truncateAll,
  uniqueEmail,
  workerDb,
} from './helpers';

/**
 * Backup cifrado, restauração isolada e reaplicação (ADR-0040; LEG-S07, LEG-D04, LEG-F04, LEG-C04, LEG-R03;
 * P7-M3). Roda os comandos de verdade (`scripts/backup.ts`) contra o Postgres do docker compose: dump do banco de
 * testes, mudanças depois do backup, restauração em `<banco>_restore`, migrações, `db:verify-roles`, contagens e
 * reaplicação a partir da origem. Dados 100% sintéticos.
 */
const TZ = 'America/Sao_Paulo';
const SECRET_NOTE = 'nota-secreta-sintetica-backup';
const ROOT = path.resolve(__dirname, '..', '..');
const silent = createLogger({ sink: () => {} });

let admin: pg.Client;
let db: Db;
let t: TestAuth;
let deps: HealthDeps;
let dir: string;
let target: string;
let restored: pg.Client | undefined;

function backup(...args: string[]): { status: number | null; output: string } {
  return backupWith({}, ...args);
}

function backupWith(
  extraEnv: Record<string, string>,
  ...args: string[]
): { status: number | null; output: string } {
  const r = spawnSync(
    process.execPath,
    ['--import', './scripts/ts-loader.mjs', 'scripts/backup.ts', ...args],
    { cwd: ROOT, env: { ...process.env, ...extraEnv }, encoding: 'utf8', timeout: 240_000 },
  );
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
}

function privacy() {
  return createPrivacyService({
    db,
    workerDb,
    logger: silent,
    reauthenticate: (userId, password, purpose, mfaCode) =>
      t.service.issueReauthProof(userId, password, purpose, mfaCode),
    accessLogRetentionDays: 180,
    proofRetentionDays: 1825,
    backupRetentionDays: 30,
    erasers: HEALTH_DATA_ERASERS,
    eraseObjects: async () => {},
    mail: t.mail,
    queue: new MemoryJobQueue(silent),
    requestFullExport: async () => false,
    appUrl: 'http://localhost:3000',
    timeZone: TZ,
  });
}

async function person(purposes: Array<'health_data' | 'marketing'>) {
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
  return { ...u, consent: c.service };
}

async function seed(userId: string) {
  const sleep = await createSleepService(deps).create(userId, {
    bedAt: '2026-10-05T23:00',
    wakeAt: '2026-10-06T07:00',
    quality: 4,
    awakenings: 0,
    note: SECRET_NOTE,
  });
  const body = await createBodyService(deps).create(userId, {
    measuredAt: '2026-10-06T08:00',
    weightKg: 70,
  });
  const meal = await createNutritionService(deps).createMeal(userId, {
    eatenAt: '2026-10-06T12:30',
    category: 'lunch',
    description: 'refeicao-sintetica-backup',
  });
  if (!sleep.ok || !body.ok || !meal.ok) throw new Error('seed');
}

async function healthRows(client: pg.Client, userId: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `SELECT (SELECT count(*) FROM sleep_entries WHERE user_id = $1)
          + (SELECT count(*) FROM body_measurements WHERE user_id = $1)
          + (SELECT count(*) FROM meal_entries WHERE user_id = $1) AS n`,
    [userId],
  );
  return Number(rows[0]?.n ?? -1);
}

async function exists(client: pg.Client, userId: string): Promise<boolean> {
  const { rows } = await client.query('SELECT 1 FROM users WHERE id = $1', [userId]);
  return rows.length > 0;
}

beforeAll(async () => {
  admin = await connectAdmin();
  await truncateAll(admin);
  db = runtimeDb();
  t = createTestAuth(db);
  const kms = new LocalKmsProvider(randomBytes(32).toString('base64'));
  deps = {
    run: (userId, fn) => withConsentOn(db, userId, 'health_data', fn),
    cipher: createFieldCipher(kms),
    timeZone: TZ,
    now: () => new Date('2026-10-07T15:00:00Z'),
  };
  // Dentro do repositório (pasta ignorada pelo git), nunca no temporário do sistema (CLAUDE.md).
  await mkdir(path.join(ROOT, '.backups'), { recursive: true });
  dir = await mkdtemp(path.join(ROOT, '.backups', 'test-'));
  const testDb = new URL(process.env.MIGRATION_DATABASE_URL ?? '').pathname.slice(1);
  target = `${testDb}_restore`;
});

afterAll(async () => {
  await restored?.end().catch(() => {});
  backup('drop', target);
  await db.$disconnect();
  await admin.end();
  await rm(dir, { recursive: true, force: true });
});

describe('backup e restauração (LEG-S07, P7-M3)', () => {
  it('restaura isolado, confere e reaplica exclusões, encerramentos, expurgos e revogações', async () => {
    // ---- Antes do backup ----
    const deleted = await person(['health_data']);
    await seed(deleted.userId);
    const minor = await person(['health_data']);
    await seed(minor.userId);
    const eliminated = await person(['health_data']);
    await seed(eliminated.userId);
    const marketing = await person(['health_data', 'marketing']);
    const control = await person(['health_data']);
    await seed(control.userId);
    const unverifiedEmail = uniqueEmail('nao-verificada');
    const age = await t.service.checkAge('1990-05-20', new Headers());
    if (age.outcome !== 'adult') throw new Error('age');
    const reg = await t.service.register(
      { email: unverifiedEmail, password: PASSWORD, ageOkCookie: age.cookie },
      META,
    );
    if (!reg.ok) throw new Error('registro');
    const { rows: un } = await admin.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [unverifiedEmail],
    );
    const unverifiedId = un[0]?.id ?? '';

    // ---- Backup ----
    const file = path.join(dir, 'teste.hmbk');
    const created = backup('create', '--out', file);
    expect(created.status, created.output).toBe(0);
    const bytes = await readFile(file);
    expect(bytes.includes(Buffer.from(deleted.email))).toBe(false);
    expect(bytes.includes(Buffer.from('policy_versions'))).toBe(false);

    // ---- Depois do backup (na origem) ----
    expect(await privacy().deleteAccount(deleted.userId, { password: PASSWORD })).toBe('deleted');
    expect(await privacy().purgeAccount(deleted.userId)).toBe('purged');
    expect(await privacy().closeMinorAccount(minor.userId, PASSWORD)).toBe('closed');
    await admin.query(`UPDATE users SET created_at = now() - interval '8 days' WHERE id = $1`, [
      unverifiedId,
    ]);
    await workerDb().$queryRaw`SELECT * FROM app.auth_purge_expired()`;
    expect(await exists(admin, unverifiedId)).toBe(false);
    await eliminated.consent.revoke(eliminated.userId, 'health_data');
    await admin.query(
      `UPDATE users SET health_data_purge_at = now() - interval '1 minute' WHERE id = $1`,
      [eliminated.userId],
    );
    const eliminator = createHealthDataEliminator({
      db,
      logger: silent,
      erasers: HEALTH_DATA_ERASERS,
      eraseObjects: async () => {},
    });
    expect(await eliminator.eliminate(eliminated.userId)).toBe('eliminated');
    // Reconsente depois da eliminação: os dados antigos do backup continuam tendo de sair.
    expect(await eliminated.consent.grant(eliminated.userId, 'health_data')).toEqual({ ok: true });
    await marketing.consent.revoke(marketing.userId, 'marketing');
    const { rows: revokedAt } = await admin.query<{ at: Date }>(
      `SELECT revoked_at AS at FROM consent_records WHERE user_id = $1 AND purpose = 'marketing'`,
      [marketing.userId],
    );
    const newcomer = await person(['health_data']);

    // ---- Restauração isolada com a origem ----
    const result = backup('restore', file, '--source');
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('Contagens conferidas');
    expect(result.output).toContain('papéis conferidos');
    expect(result.output).toMatch(
      /Reaplicado: 2 contas purgadas, 1 não verificadas removidas, 1 eliminações/,
    );
    for (const secret of [
      deleted.userId,
      minor.userId,
      deleted.email,
      unverifiedEmail,
      SECRET_NOTE,
    ]) {
      expect(result.output).not.toContain(secret);
    }

    const url = new URL(process.env.MIGRATION_DATABASE_URL ?? '');
    url.pathname = `/${target}`;
    restored = new pg.Client({ connectionString: url.toString() });
    await restored.connect();

    // Exclusão e encerramento de menor: conta e dados de saúde fora; provas da origem com as datas dela.
    for (const gone of [deleted.userId, minor.userId]) {
      expect(await exists(restored, gone)).toBe(false);
      expect(await healthRows(restored, gone)).toBe(0);
    }
    const proofs = async (client: pg.Client, userId: string) =>
      (
        await client.query<{ kind: string; status: string; closed: string }>(
          `SELECT kind::text, status::text, closed_at::text AS closed FROM privacy_requests
            WHERE user_id = $1 ORDER BY created_at`,
          [userId],
        )
      ).rows;
    expect(await proofs(restored, deleted.userId)).toEqual(await proofs(admin, deleted.userId));
    expect((await proofs(restored, minor.userId)).map((r) => r.kind)).toContain('minor_closure');
    // Conta não verificada expurgada depois do backup não volta.
    expect(await exists(restored, unverifiedId)).toBe(false);
    // Eliminação de saúde reaplicada, mesmo com consentimento ativo de novo; a conta continua.
    expect(await exists(restored, eliminated.userId)).toBe(true);
    expect(await healthRows(restored, eliminated.userId)).toBe(0);
    // Revogação copiada com a data da origem; nada de "ativo" de novo.
    const { rows: mk } = await restored.query<{ at: Date | null }>(
      `SELECT revoked_at AS at FROM consent_records WHERE user_id = $1 AND purpose = 'marketing'`,
      [marketing.userId],
    );
    expect(mk[0]?.at?.toISOString()).toBe(revokedAt[0]?.at.toISOString());
    // Controle intacto; quem chegou depois do backup não existe no ponto restaurado.
    expect(await healthRows(restored, control.userId)).toBe(3);
    expect(await exists(restored, newcomer.userId)).toBe(false);
    // Acesso zerado: nenhuma sessão válida, nenhum token; AuditLog da reaplicação com o papel.
    const { rows: live } = await restored.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM sessions WHERE revoked_at IS NULL',
    );
    expect(live[0]?.n).toBe(0);
    const { rows: tokens } = await restored.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM auth_tokens',
    );
    expect(tokens[0]?.n).toBe(0);
    const { rows: audit } = await restored.query<{ role: string; subject: string | null }>(
      `SELECT operator_role AS role, subject_user_id AS subject FROM audit_logs
        WHERE action = 'restore_reapplied'`,
    );
    expect(audit).toEqual([{ role: 'app_migrator', subject: null }]);
    // O próximo teste restaura de novo no mesmo banco (DROP ... WITH FORCE derrubaria esta conexão).
    await restored.end();
    restored = undefined;
  }, 300_000);

  it('livro fora do banco: recusa livro antigo e de outra instalação, limite de remoções e acesso liberado', async () => {
    const restoredUrl = (role: 'MIGRATION_DATABASE_URL' | 'WORKER_DATABASE_URL') => {
      const u = new URL(process.env[role] ?? '');
      u.pathname = `/${target}`;
      return u.toString();
    };
    const restoreEnv = {
      RESTORE_MIGRATION_DATABASE_URL: restoredUrl('MIGRATION_DATABASE_URL'),
      RESTORE_WORKER_DATABASE_URL: restoredUrl('WORKER_DATABASE_URL'),
    };
    // Livro lido ANTES do backup (revisão A1).
    const oldBook = path.join(dir, 'livro-antigo.hmbk');
    expect(backup('ledger', '--out', oldBook).status).toBe(0);
    // Seis contas não verificadas que somem na origem depois do backup: acima do limite de 5.
    const ids: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const email = uniqueEmail('lote');
      const age = await t.service.checkAge('1990-05-20', new Headers());
      if (age.outcome !== 'adult') throw new Error('age');
      const reg = await t.service.register(
        { email, password: PASSWORD, ageOkCookie: age.cookie },
        { ...META, ip: `192.0.2.${i + 1}` },
      );
      if (!reg.ok) throw new Error('registro');
      const { rows } = await admin.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
        email,
      ]);
      ids.push(rows[0]?.id ?? '');
    }
    const file = path.join(dir, 'segundo.hmbk');
    const created = backup('create', '--out', file);
    expect(created.status, created.output).toBe(0);
    const point = /Ponto do backup: (\S+)/.exec(created.output)?.[1] ?? '';
    await admin.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
    const book = path.join(dir, 'livro.hmbk');
    expect(backup('ledger', '--out', book).status).toBe(0);

    const stale = backup('restore', file, '--ledger', oldBook);
    expect(stale.status).toBe(2);
    expect(stale.output).toContain('lido antes do ponto do backup');

    const dry = backup('restore', file, '--ledger', book, '--dry-run');
    expect(dry.status, dry.output).toBe(0);
    expect(dry.output).toContain('Plano: 0 contas a encerrar, 6 não verificadas a remover');
    expect(dry.output).toContain('nada foi reaplicado');

    const capped = backup('restore', file, '--ledger', book);
    expect(capped.status).toBe(2);
    expect(capped.output).toContain('--confirm-closures 6');

    const owner = new pg.Client({ connectionString: restoreEnv.RESTORE_MIGRATION_DATABASE_URL });
    await owner.connect();
    try {
      // Livro de outra instalação (revisão A2): o banco recusa antes de mudar qualquer coisa.
      const { rows: inst } = await owner.query<{ id: string }>('SELECT id FROM app.installation');
      await owner.query('UPDATE app.installation SET id = gen_random_uuid()');
      const foreign = backupWith(
        restoreEnv,
        'reapply',
        '--since',
        point,
        '--ledger',
        book,
        '--confirm-closures',
        '6',
      );
      expect(foreign.status).toBe(1);
      expect(foreign.output).toContain('código 22023');
      expect(await exists(owner, ids[0] ?? '')).toBe(true);
      await owner.query('UPDATE app.installation SET id = $1', [inst[0]?.id]);

      const ok = backupWith(
        restoreEnv,
        'reapply',
        '--since',
        point,
        '--ledger',
        book,
        '--confirm-closures',
        '6',
      );
      expect(ok.status, ok.output).toBe(0);
      expect(ok.output).toContain('6 não verificadas removidas');
      for (const id of ids) expect(await exists(owner, id)).toBe(false);

      // Depois de liberado (alguém entrou de novo), nada da reaplicação roda outra vez.
      const { rows: someone } = await owner.query<{ id: string }>(
        'SELECT id FROM users WHERE deleted_at IS NULL LIMIT 1',
      );
      await owner.query(
        `INSERT INTO sessions (id, user_id, token_hash, device_label, idle_expires_at, expires_at,
                               created_at, updated_at)
         VALUES (gen_random_uuid(), $1, sha256(gen_random_uuid()::text::bytea), 'teste', now() + interval '1 hour',
                 now() + interval '1 day', now() + interval '1 second', now())`,
        [someone[0]?.id],
      );
      const again = backupWith(restoreEnv, 'reapply', '--since', point, '--no-source');
      expect(again.status).toBe(1);
      expect(again.output).toContain('código 55000');
      // Outro ponto digitado não contorna a trava (segunda revisão, N1).
      const earlier = new Date(Date.parse(point) - 60 * 60 * 1000).toISOString();
      const otherPoint = backupWith(restoreEnv, 'reapply', '--since', earlier, '--no-source');
      expect(otherPoint.status).toBe(1);
      expect(otherPoint.output).toContain('código 22023');
    } finally {
      await owner.end();
    }
  }, 300_000);

  it('recusa banco de destino que não seja isolado e arquivo alterado', async () => {
    const file = path.join(dir, 'teste.hmbk');
    const wrongTarget = backup('restore', file, '--source', '--target', 'healthmind');
    expect(wrongTarget.status).toBe(2);
    const bytes = await readFile(file);
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
    const tampered = path.join(dir, 'alterado.hmbk');
    await writeFile(tampered, bytes);
    const r = backup('restore', tampered, '--source', '--target', 'outro_restore');
    expect(r.status).toBe(1);
    expect(r.output).toContain('arquivo alterado ou chave errada');
    // Nada foi criado com o arquivo alterado.
    const { rows } = await admin.query(`SELECT 1 FROM pg_database WHERE datname = 'outro_restore'`);
    expect(rows).toHaveLength(0);
  }, 120_000);

  it('ponto anterior aos dados restaurados é recusado na primeira execução (segunda revisão, N2)', async () => {
    await expect(
      admin.query(`SELECT app.restore_begin(now() - interval '1 year')`),
    ).rejects.toMatchObject({ code: '22023' });
  });

  it('nenhum papel da aplicação executa as funções de restauração (só o dono)', async () => {
    for (const role of ['app_user', 'app_worker', 'app_operator']) {
      const { rows } = await admin.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app' AND p.proname LIKE 'restore\\_%'
            AND has_function_privilege($1, p.oid, 'EXECUTE')`,
        [role],
      );
      expect(rows[0]?.n).toBe(0);
    }
  });
});
