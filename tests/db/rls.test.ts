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

  it('PUBLIC não executa as funções de app; app_user só as que recebeu', async () => {
    const { rows } = await admin.query<{ name: string; pub: boolean; usr: boolean }>(
      `SELECT p.proname AS name,
              has_function_privilege('public', p.oid, 'EXECUTE') AS pub,
              has_function_privilege('app_user', p.oid, 'EXECUTE') AS usr
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app'`,
    );
    for (const fn of rows) {
      expect(fn.pub, fn.name).toBe(false);
      expect(fn.usr, fn.name).toBe(true);
    }
  });

  it('auth_resolve_session devolve só o mínimo (sem hash de senha)', async () => {
    const { rows } = await admin.query<{ cols: string }>(
      `SELECT pg_get_function_result('app.auth_resolve_session(bytea)'::regprocedure) AS cols`,
    );
    expect(rows[0]?.cols).not.toMatch(/password|email\b|totp/);
  });
});
