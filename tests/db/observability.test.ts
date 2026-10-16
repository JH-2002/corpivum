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
      window_minutes: number;
      baseline_per_hour: bigint | null;
      operator_actions_max: number;
    }>
  >`SELECT * FROM app.security_volume_sample()`;
}

/** Recua todas as amostras guardadas, como se o tempo tivesse passado. */
async function ageSamples(minutes: number): Promise<void> {
  await admin.query(
    `UPDATE app.read_volume_samples SET sampled_at = sampled_at - make_interval(mins => $1)`,
    [minutes],
  );
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

  it('sem amostra de 55 min atrás não há linha; o período de relógio conta a leitura em massa', async () => {
    await admin.query('DELETE FROM app.read_volume_samples');
    const u = await createVerifiedUser(t);
    await admin.query(
      `INSERT INTO body_measurements (id, user_id, measured_at, weight_kg, updated_at)
       SELECT gen_random_uuid(), $1, now() - make_interval(days => g), 70, now()
         FROM generate_series(1, 200) g`,
      [u.userId],
    );
    expect(await sample()).toEqual([]);
    expect(await sample()).toEqual([]);
    await ageSamples(60);
    // Leitura em massa como faria código rodando como o runtime: 10 varreduras de 200 linhas.
    await bulkRead(10, 2000);
    // Revisão M1: uma chamada extra no meio do período não "gasta" o delta da próxima.
    expect(await sample()).toHaveLength(1);
    const rows = await sample();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.tuples_read)).toBeGreaterThanOrEqual(2000);
    expect(rows[0]?.window_minutes).toBeGreaterThanOrEqual(60);
    expect(rows[0]?.baseline_per_hour).toBeNull();
  });

  it('linha de base: mediana por hora dos 7 dias anteriores, com pelo menos 24 taxas', async () => {
    await admin.query('DELETE FROM app.read_volume_samples');
    // 30 amostras de hora em hora, 1.000 tuplas por hora (contadores sintéticos).
    await admin.query(
      `INSERT INTO app.read_volume_samples (sampled_at, tuples_total)
       SELECT now() - make_interval(hours => 31 - g), g * 1000 FROM generate_series(0, 30) g`,
    );
    const rows = await sample();
    expect(Number(rows[0]?.baseline_per_hour)).toBe(1000);
  });

  it('sessões tocadas pelo runtime em várias contas não mexem no teto (revisão A1)', async () => {
    await admin.query('DELETE FROM app.read_volume_samples');
    await sample();
    await ageSamples(60);
    for (let i = 0; i < 3; i += 1) {
      const u = await createVerifiedUser(t);
      await admin.query(`UPDATE sessions SET last_seen_at = now() WHERE user_id = $1`, [u.userId]);
    }
    const reporter = new MemoryErrorReporter();
    const monitor = createVolumeMonitor({
      workerDb,
      reporter: () => reporter,
      logger: silent,
      limits: { readFloorPerHour: 1000, readBaselineMultiplier: 5, operatorActionsPerHour: 1000 },
    });
    await bulkRead(10, 2000);
    const result = await monitor.check();
    expect(result?.read.threshold).toBeLessThanOrEqual(1100);
    expect(result?.read.anomalous).toBe(true);
    expect(reporter.alerts).toEqual([
      expect.objectContaining({ name: 'security.read_volume_anomaly' }),
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
    await admin.query('DELETE FROM app.read_volume_samples');
    await sample();
    await ageSamples(60);
    await operator.query(
      `SELECT app.operator_request_register('outra@exemplo.test', 'correction', now())`,
    );
    const next = await sample();
    expect(next[0]?.operator_actions_max).toBeGreaterThanOrEqual(1);
  });
});
