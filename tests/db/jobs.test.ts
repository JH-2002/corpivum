import type pg from 'pg';
import { PgJobQueue } from '@/adapters/jobs/postgres';
import type { Db } from '@/lib/db/client';
import { withUserOn } from '@/lib/db/rls';
import { createLogger, type LogRecord } from '@/lib/logger';
import { connectAdmin, runtimeDb, truncateAll } from './helpers';

/** Fila de jobs no Postgres (OI-14, ADR-0019; PR1a-R2-B6). */
let admin: pg.Client;
let db: Db;

const silent = () => {
  const logs: LogRecord[] = [];
  return { logs, logger: createLogger({ minLevel: 'debug', sink: (r) => logs.push(r) }) };
};

beforeAll(async () => {
  admin = await connectAdmin();
  db = runtimeDb();
});

beforeEach(async () => {
  await truncateAll(admin);
});

afterAll(async () => {
  await db.$disconnect();
  await admin.end();
});

describe('PgJobQueue', () => {
  it('executa o job uma vez e o apaga ao concluir', async () => {
    const q = new PgJobQueue(db, silent());
    const seen: unknown[] = [];
    q.register('test.run', async (payload) => {
      seen.push(payload);
    });
    await q.enqueue('test.run', { userId: 'abc', n: 1 });
    expect(await q.runOnce()).toBe(1);
    expect(seen).toEqual([{ userId: 'abc', n: 1 }]);
    expect(await q.runOnce()).toBe(0);
    const { rows } = await admin.query('SELECT count(*)::int AS n FROM job_queue');
    expect(rows[0].n).toBe(0);
  });

  it('dois workers concorrentes nunca executam o mesmo job', async () => {
    const counts = new Map<string, number>();
    const make = () => {
      const q = new PgJobQueue(db, { ...silent(), batchSize: 5 });
      q.register('test.count', async (payload) => {
        const k = String(payload.k);
        counts.set(k, (counts.get(k) ?? 0) + 1);
        await new Promise((r) => setTimeout(r, 5));
      });
      return q;
    };
    const [a, b] = [make(), make()];
    for (let i = 0; i < 20; i++) await a.enqueue('test.count', { k: i });
    let done = 0;
    for (let round = 0; round < 10 && done < 20; round++) {
      const [x, y] = await Promise.all([a.runOnce(), b.runOnce()]);
      done += x + y;
    }
    expect(done).toBe(20);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    expect(counts.size).toBe(20);
  });

  it('singletonKey: N instâncias agendando o mesmo job recorrente criam um só (PR1a-R2-B6)', async () => {
    const q1 = new PgJobQueue(db, silent());
    const q2 = new PgJobQueue(db, silent());
    const ids = await Promise.all([
      q1.enqueue('test.recurring', {}, { singletonKey: 'test.recurring' }),
      q2.enqueue('test.recurring', {}, { singletonKey: 'test.recurring' }),
      q1.enqueue('test.recurring', {}, { singletonKey: 'test.recurring' }),
    ]);
    expect(new Set(ids).size).toBe(1);
    const { rows } = await admin.query('SELECT count(*)::int AS n FROM job_queue');
    expect(rows[0].n).toBe(1);
  });

  it('um job em execução pode agendar o próximo da mesma chave', async () => {
    const q = new PgJobQueue(db, silent());
    q.register('test.chain', async () => {
      await q.enqueue(
        'test.chain',
        {},
        { singletonKey: 'test.chain', runAt: new Date(Date.now() + 3600_000) },
      );
    });
    await q.enqueue('test.chain', {}, { singletonKey: 'test.chain' });
    expect(await q.runOnce()).toBe(1);
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM job_queue WHERE status = 'queued' AND run_at > now()`,
    );
    expect(rows[0].n).toBe(1);
  });

  it('falha volta à fila com atraso e, sem tentativas restantes, fica failed (só o código do erro)', async () => {
    const { logs, logger } = silent();
    const q = new PgJobQueue(db, { logger });
    q.register('test.fail', async () => {
      throw new RangeError('conteúdo que não deve ir ao log');
    });
    await q.enqueue('test.fail', {}, { maxAttempts: 2 });
    expect(await q.runOnce()).toBe(0);
    let { rows } = await admin.query(
      `SELECT status, attempts, last_error_code, run_at > now() AS later FROM job_queue`,
    );
    expect(rows[0]).toEqual({
      status: 'queued',
      attempts: 1,
      last_error_code: 'RangeError',
      later: true,
    });
    await admin.query('UPDATE job_queue SET run_at = now()');
    await q.runOnce();
    ({ rows } = await admin.query('SELECT status, attempts FROM job_queue'));
    expect(rows[0]).toEqual({ status: 'failed', attempts: 2 });
    expect(JSON.stringify(logs)).not.toContain('conteúdo');
  });

  it('job travado por worker que morreu volta a ser executável quando a reserva vence', async () => {
    const dead = new PgJobQueue(db, { ...silent(), lockSeconds: 60 });
    dead.register('test.stuck', async () => {});
    await dead.enqueue('test.stuck', {});
    await db.$queryRaw`SELECT * FROM app.jobs_claim(${dead.workerId}, ${['test.stuck']}::text[], 1, 60)`;
    const alive = new PgJobQueue(db, silent());
    let ran = 0;
    alive.register('test.stuck', async () => {
      ran += 1;
    });
    expect(await alive.runOnce()).toBe(0);
    await admin.query(`UPDATE job_queue SET locked_until = now() - interval '1 second'`);
    expect(await alive.runOnce()).toBe(1);
    expect(ran).toBe(1);
  });

  it('não há cancelamento genérico: só a eliminação da própria pessoa, no contexto dela (revisão M4)', async () => {
    const q = new PgJobQueue(db, silent());
    const later = new Date(Date.now() + 1e6);
    const a = '00000000-0000-7000-8000-00000000000a';
    const b = '00000000-0000-7000-8000-00000000000b';
    await q.enqueue('test.recurring', {}, { singletonKey: 'test.recurring', runAt: later });
    for (const id of [a, b]) {
      await q.enqueue(
        'privacy.health_data_eliminate',
        { userId: id },
        {
          singletonKey: `health-eliminate:${id}`,
          runAt: later,
        },
      );
    }
    await expect(db.$queryRaw`SELECT app.health_elimination_cancel()`).rejects.toThrow();
    const n = await withUserOn(
      db,
      a,
      (tx) => tx.$executeRaw`SELECT app.health_elimination_cancel()`,
    );
    expect(n).toBe(1);
    const { rows } = await admin.query('SELECT singleton_key FROM job_queue ORDER BY 1');
    expect(rows.map((r) => r.singleton_key)).toEqual([`health-eliminate:${b}`, 'test.recurring']);
  });

  it('o runtime não lê a tabela e o enqueue valida nome e payload', async () => {
    await expect(db.$queryRaw`SELECT * FROM job_queue`).rejects.toThrow(/permission denied/);
    const q = new PgJobQueue(db, silent());
    await expect(q.enqueue('Nome Inválido', {})).rejects.toThrow();
    await expect(q.enqueue('test.big', { x: 'a'.repeat(3000) })).rejects.toThrow();
  });
});
