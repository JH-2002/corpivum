import type pg from 'pg';
import type { Db } from '@/lib/db/client';
import { forUserOn, withUserOn } from '@/lib/db/rls';
import {
  connectAdmin,
  createTestAuth,
  createVerifiedUser,
  publicTables,
  runtimeDb,
  truncateAll,
  type TestAuth,
} from './helpers';

/** LEG-S03: isolamento entre usuários, consulta sem contexto e funções SECURITY DEFINER. */
let admin: pg.Client;
let db: Db;
let t: TestAuth;
let a: { userId: string; email: string };
let b: { userId: string; email: string };

beforeAll(async () => {
  admin = await connectAdmin();
  await truncateAll(admin);
  db = runtimeDb();
  t = createTestAuth(db);
  a = await createVerifiedUser(t);
  b = await createVerifiedUser(t);
  // Cada um com códigos de recuperação (via MFA) para haver linhas em todas as tabelas de usuário.
  for (const u of [a, b]) {
    await admin.query(
      `INSERT INTO recovery_codes (id, user_id, code_hash, updated_at)
       VALUES (gen_random_uuid(), $1, decode(md5(random()::text) || md5(random()::text), 'hex'), now())`,
      [u.userId],
    );
  }
});

afterAll(async () => {
  await db.$disconnect();
  await admin.end();
});

describe('consulta sem app.user_id retorna vazio (LEG-S03)', () => {
  it('app_user sem contexto vê zero linhas em todas as tabelas', async () => {
    const tables = await publicTables(admin);
    expect(tables.length).toBeGreaterThanOrEqual(5);
    const { rows: adminCounts } = await admin.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM users',
    );
    expect(adminCounts[0]?.n).toBeGreaterThanOrEqual(2);

    // Sem privilégio algum para o runtime: falham fechado (permission denied).
    const denied = new Set([
      'auth_tokens',
      'rate_limit_buckets',
      'audit_logs',
      'access_logs',
      'job_queue',
      'reauth_proofs',
    ]);
    // Catálogo público de versões de documentos: sem dado pessoal, legível por todos (ADR-0019).
    const publicCatalog = new Set(['policy_versions']);
    for (const table of tables) {
      const query = db.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT count(*)::int AS n FROM public."${table}"`,
      );
      if (publicCatalog.has(table)) {
        expect((await query)[0]?.n, table).toBeGreaterThan(0);
      } else if (denied.has(table)) {
        await expect(query, table).rejects.toThrow(/permission denied/);
      } else {
        expect((await query)[0]?.n, table).toBe(0);
      }
    }
  });

  it('contexto vazio ou inválido também retorna zero linhas', async () => {
    for (const value of ['', 'nao-e-uuid', "' OR 1=1 --"]) {
      const n = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.user_id', ${value}, true)`;
        const r = await tx.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM users`;
        return r[0]?.n;
      });
      expect(n).toBe(0);
    }
  });

  it('o contexto não vaza para a transação seguinte da mesma conexão', async () => {
    await withUserOn(db, a.userId, (tx) => tx.user.count());
    const n = await db.user.count();
    expect(n).toBe(0);
  });

  it('withUser/forUser recusam userId que não é UUID', async () => {
    await expect(withUserOn(db, "x' OR '1'='1", async () => 1)).rejects.toThrow(/userId/);
    expect(() => forUserOn(db, 'abc')).toThrow(/userId/);
  });
});

describe('isolamento entre dois usuários (LEG-S03)', () => {
  it('A só lê as próprias linhas, mesmo filtrando pelo id de B', async () => {
    await withUserOn(db, a.userId, async (tx) => {
      expect(await tx.user.findMany({ select: { id: true } })).toEqual([{ id: a.userId }]);
      expect(await tx.user.findUnique({ where: { id: b.userId } })).toBeNull();
      expect(await tx.session.count({ where: { userId: b.userId } })).toBe(0);
      expect(await tx.recoveryCode.count({ where: { userId: b.userId } })).toBe(0);
      expect(await tx.session.count()).toBeGreaterThan(0);
    });
  });

  it('forUser aplica o mesmo isolamento operação a operação', async () => {
    const asA = forUserOn(db, a.userId);
    expect(await asA.user.count()).toBe(1);
    expect(await asA.session.findMany({ where: { userId: b.userId } })).toEqual([]);
  });

  it('A não altera nem apaga linhas de B', async () => {
    await withUserOn(db, a.userId, async (tx) => {
      const upd = await tx.session.updateMany({
        where: { userId: b.userId },
        data: { revokedAt: new Date() },
      });
      expect(upd.count).toBe(0);
      const updUser = await tx.user.updateMany({
        where: { id: b.userId },
        data: { passwordHash: 'x' },
      });
      expect(updUser.count).toBe(0);
      const del = await tx.recoveryCode.deleteMany({ where: { userId: b.userId } });
      expect(del.count).toBe(0);
    });
    const { rows } = await admin.query(
      'SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND revoked_at IS NULL',
      [b.userId],
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it('WITH CHECK impede A de inserir linha em nome de B ou mover a própria para B', async () => {
    await expect(
      withUserOn(db, a.userId, (tx) =>
        tx.recoveryCode.create({ data: { userId: b.userId, codeHash: new Uint8Array(32) } }),
      ),
    ).rejects.toThrow();
    await expect(
      withUserOn(db, a.userId, (tx) =>
        tx.session.updateMany({ where: { userId: a.userId }, data: { userId: b.userId } }),
      ),
    ).rejects.toThrow();
  });

  it('A não revoga a sessão de B pelo serviço (id de outra pessoa não é alcançado)', async () => {
    const { rows } = await admin.query<{ id: string }>(
      'SELECT id FROM sessions WHERE user_id = $1 AND revoked_at IS NULL LIMIT 1',
      [b.userId],
    );
    const bSession = rows[0]?.id ?? '';
    expect(await t.service.revokeSession(a.userId, bSession)).toBe(false);
    const after = await admin.query('SELECT revoked_at FROM sessions WHERE id = $1', [bSession]);
    expect(after.rows[0].revoked_at).toBeNull();
  });
});

describe('privilégios e funções SECURITY DEFINER (ADR-0015)', () => {
  it('runtime não cria usuário direto nem toca auth_tokens/rate_limit_buckets', async () => {
    await expect(
      db.$executeRaw`INSERT INTO users (id, email, password_hash, adult_attested_at, age_gate_version, updated_at)
        VALUES (gen_random_uuid(), 'x@exemplo.test', 'x', now(), 'v1', now())`,
    ).rejects.toThrow();
    await expect(db.$queryRaw`SELECT * FROM auth_tokens`).rejects.toThrow();
    await expect(db.$queryRaw`SELECT * FROM rate_limit_buckets`).rejects.toThrow();
    await expect(db.$queryRaw`SELECT * FROM _prisma_migrations`).rejects.toThrow();
  });

  it('toda função SECURITY DEFINER tem search_path fixo e não usa EXECUTE dinâmico', async () => {
    const { rows } = await admin.query<{ name: string; config: string[] | null; src: string }>(
      `SELECT n.nspname || '.' || p.proname AS name, p.proconfig AS config, p.prosrc AS src
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema')`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const fn of rows) {
      expect(fn.config ?? [], fn.name).toContainEqual(
        expect.stringMatching(/^search_path=pg_catalog, pg_temp$/),
      );
      expect(fn.src, fn.name).not.toMatch(/\bEXECUTE\b/i);
    }
  });

  it('PUBLIC não executa as funções de app; app_user, app_worker e app_operator só as que receberam', async () => {
    const { rows } = await admin.query<{
      name: string;
      pub: boolean;
      usr: boolean;
      wrk: boolean;
      op: boolean;
    }>(
      `SELECT p.proname AS name,
              has_function_privilege('public', p.oid, 'EXECUTE') AS pub,
              has_function_privilege('app_user', p.oid, 'EXECUTE') AS usr,
              has_function_privilege('app_worker', p.oid, 'EXECUTE') AS wrk,
              has_function_privilege('app_operator', p.oid, 'EXECUTE') AS op
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app'`,
    );
    // Atendimento manual (ADR-0034/0037): o operador só executa as funções `operator_*`, e o runtime nenhuma.
    const operatorOnly = (name: string) => name.startsWith('operator_');
    // Jobs (ADR-0036 D5, ADR-0037): varreduras, expurgos, fila e purga só no app_worker, nunca no web.
    const workerOnly = new Set([
      'auth_purge_expired',
      'reminders_active',
      'privacy_purge_access_logs',
      'privacy_purge_proofs',
      'privacy_purge_reauth_proofs',
      'privacy_due_health_eliminations',
      'privacy_request_deadlines',
      'account_purge',
      'account_purge_due',
      'exports_cleanup_due',
      'exports_purge_rows',
      'jobs_claim',
      'jobs_complete',
      'jobs_fail',
      'onboarding_expiry_notices_due',
      'onboarding_expiry_notice_mark',
      'onboarding_expired_purge',
      // Alerta de volume (ADR-0038, P7-M1).
      'security_volume_sample',
      // Órfãos do storage (OI-35, ADR-0040).
      'exports_orphans',
    ]);
    // Reaplicação depois de restaurar um backup (P7-M3, ADR-0040): só o dono, nenhum papel da aplicação.
    const ownerOnly = (name: string) => name.startsWith('restore_');
    expect(
      rows
        .filter((fn) => fn.op)
        .map((fn) => fn.name)
        .sort(),
    ).toEqual([
      'operator_account_delete',
      'operator_request_close',
      'operator_request_contact',
      'operator_request_register',
      'operator_requests_due',
      'operator_role',
    ]);
    expect(rows.filter((fn) => workerOnly.has(fn.name))).toHaveLength(workerOnly.size);
    expect(rows.filter((fn) => ownerOnly(fn.name))).toHaveLength(8);
    for (const fn of rows) {
      expect(fn.pub, fn.name).toBe(false);
      const appRole = !ownerOnly(fn.name);
      expect(fn.usr, fn.name).toBe(appRole && !operatorOnly(fn.name) && !workerOnly.has(fn.name));
      // O worker herda o app_user (jobs por pessoa) e executa as próprias; nunca as do operador.
      expect(fn.wrk, fn.name).toBe(appRole && !operatorOnly(fn.name));
    }
  });

  it('o runtime não grava deleted_at nem colunas de sessão fora da lista (P7-B1, PR1a-R2-B5)', async () => {
    const { rows } = await admin.query<{ col: string; usr: boolean }>(
      `SELECT c.table_name || '.' || c.column_name AS col,
              has_column_privilege('app_user', format('public.%I', c.table_name), c.column_name, 'UPDATE') AS usr
         FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name IN ('users', 'sessions')`,
    );
    const updatable = rows.filter((r) => r.usr).map((r) => r.col);
    expect(updatable).not.toContain('users.deleted_at');
    expect(updatable.filter((c) => c.startsWith('sessions.')).sort()).toEqual([
      'sessions.idle_expires_at',
      'sessions.last_seen_at',
      'sessions.mfa_attempts',
      'sessions.revoked_at',
      'sessions.updated_at',
    ]);
  });

  it('auth_resolve_session devolve só o mínimo (sem hash de senha)', async () => {
    const { rows } = await admin.query<{ cols: string }>(
      `SELECT pg_get_function_result('app.auth_resolve_session(bytea)'::regprocedure) AS cols`,
    );
    expect(rows[0]?.cols).not.toMatch(/password|email\b|totp/);
  });
});
