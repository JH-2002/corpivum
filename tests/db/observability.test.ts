import pg from 'pg';
import { MemoryErrorReporter } from '@/adapters/error-reporter/memory';
import type { Db } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';
import { createVolumeMonitor } from '@/modules/observability';
import {
  connectAdmin,
  createTestAuth,
  createVerifiedUser,
  runtimeDb,
  type TestAuth,
  truncateAll,
  workerDb,
} from './helpers';
import { assertDisposableDatabase } from './safety';

/**
 * Fase 7c (ADR-0038): amostra de volume só no `app_worker` (P7-M1) e rastro da consulta do encarregado que não
 * abre pedido (7b-R3). Dados 100% sintéticos.
 */
let admin: pg.Client;
let db: Db;
let t: TestAuth;
const silent = createLogger({ sink: () => {} });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sample() {
  return workerDb().$queryRaw<
    Array<{
      tuples_read: bigint;
      active_users: number;
      window_minutes: number;
      operator_actions_max: number;
    }>
  >`SELECT * FROM app.security_volume_sample()`;
}

/** Tuplas lidas das medidas segundo os contadores do Postgres (sem o cache da transação). */
async function measurementReads(): Promise<number> {
  await admin.query('SELECT pg_stat_clear_snapshot()');
  const { rows } = await admin.query<{ n: string }>(
    `SELECT (coalesce(seq_tup_read, 0) + coalesce(idx_tup_fetch, 0))::text AS n
       FROM pg_stat_user_tables WHERE schemaname = 'public' AND relname = 'body_measurements'`,
  );
  return Number(rows[0]?.n ?? 0);
}

/** Lê as medidas `times` vezes e espera os contadores do Postgres registrarem `atLeast` tuplas a mais. */
async function bulkRead(times: number, atLeast: number): Promise<void> {
  const before = await measurementReads();
  for (let i = 0; i < times; i += 1) await admin.query('SELECT count(*) FROM body_measurements');
  await admin.query('SELECT pg_stat_force_next_flush()');
  for (let i = 0; i < 40; i += 1) {
    if ((await measurementReads()) >= before + atLeast) return;
    await sleep(250);
  }
  throw new Error('contadores do Postgres não chegaram');
}

beforeAll(async () => {
  admin = await connectAdmin();
  await truncateAll(admin);
  await admin.query('DELETE FROM app.read_volume_samples');
  db = runtimeDb();
  t = createTestAuth(db);
});

afterAll(async () => {
  await db.$disconnect();
  await admin.end();
});

describe('amostra de volume (P7-M1)', () => {
  it('só o app_worker executa; ninguém lê a tabela de amostras', async () => {
    await expect(db.$queryRaw`SELECT * FROM app.security_volume_sample()`).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.$queryRaw`SELECT * FROM app.read_volume_samples`).rejects.toThrow(
      /permission denied/,
    );
    await expect(workerDb().$queryRaw`SELECT * FROM app.read_volume_samples`).rejects.toThrow(
      /permission denied/,
    );
  });

  it('primeira amostra sem linha; a seguinte conta as leituras das tabelas de saúde e quem está ativo', async () => {
    await admin.query('DELETE FROM app.read_volume_samples');
    const u = await createVerifiedUser(t);
    await admin.query(
      `INSERT INTO body_measurements (id, user_id, measured_at, weight_kg, updated_at)
       SELECT gen_random_uuid(), $1, now() - make_interval(days => g), 70, now()
         FROM generate_series(1, 200) g`,
      [u.userId],
    );
    expect(await sample()).toEqual([]);
    // Leitura em massa como faria código rodando como o runtime: 10 varreduras de 200 linhas.
    await bulkRead(10, 2000);

    const rows = await sample();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.tuples_read)).toBeGreaterThanOrEqual(2000);
    expect(rows[0]?.active_users).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.window_minutes).toBe(1);
  });

  it('o monitor alerta com teto baixo e não leva pessoa, papel nem recurso', async () => {
    const reporter = new MemoryErrorReporter();
    const monitor = createVolumeMonitor({
      workerDb,
      reporter: () => reporter,
      logger: silent,
      limits: { readFloorPerHour: 0, readPerActiveUserPerHour: 0, operatorActionsPerHour: 1000 },
    });
    await bulkRead(5, 1000);
    const result = await monitor.check();
    expect(result?.read.anomalous).toBe(true);
    expect(reporter.alerts).toEqual([
      expect.objectContaining({ name: 'security.read_volume_anomaly', threshold: 0 }),
    ]);
    expect(Object.keys(reporter.alerts[0] ?? {}).sort()).toEqual([
      'count',
      'name',
      'occurredAt',
      'threshold',
    ]);
  });
});

describe('consulta do encarregado sem pedido novo (7b-R3)', () => {
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

  it('e-mail sem conta e pedido já aberto deixam AuditLog com o papel, sem e-mail', async () => {
    const u = await createVerifiedUser(t);
    await admin.query(`DELETE FROM audit_logs WHERE action = 'privacy_request_lookup'`);
    await operator.query(
      `SELECT app.operator_request_register('ninguem@exemplo.test', 'correction', now())`,
    );
    const first = await operator.query(
      `SELECT app.operator_request_register($1, 'correction', now()) AS id`,
      [u.email],
    );
    await operator.query(`SELECT app.operator_request_register($1, 'correction', now())`, [
      u.email,
    ]);
    const { rows } = await admin.query(
      `SELECT subject_user_id, resource_id, operator_role, actor_user_id
         FROM audit_logs WHERE action = 'privacy_request_lookup' ORDER BY created_at`,
    );
    expect(rows).toEqual([
      {
        subject_user_id: null,
        resource_id: null,
        operator_role: operatorRole(),
        actor_user_id: null,
      },
      {
        subject_user_id: u.userId,
        resource_id: first.rows[0].id,
        operator_role: operatorRole(),
        actor_user_id: null,
      },
    ]);
    // Entra na contagem por operador da amostra seguinte.
    await sample();
    await operator.query(
      `SELECT app.operator_request_register('outra@exemplo.test', 'correction', now())`,
    );
    const next = await sample();
    expect(next[0]?.operator_actions_max).toBeGreaterThanOrEqual(1);
  });
});
