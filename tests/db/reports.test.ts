import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type pg from 'pg';
import { LocalKmsProvider } from '@/adapters/kms/local';
import { LocalStorageProvider } from '@/adapters/storage/local';
import type { Db } from '@/lib/db/client';
import { withUserOn } from '@/lib/db/rls';
import { createLogger } from '@/lib/logger';
import { withConsentOn } from '@/modules/consent/guard';
import { createFieldCipher, type HealthDeps } from '@/modules/health/core';
import { HEALTH_DATA_ERASERS } from '@/modules/health/erasers';
import { createOwnSource } from '@/modules/health/server';
import { createHealthDataEliminator } from '@/modules/privacy/health-data';
import { mentionsInternalValue, readZip } from '@/modules/reports';
import { createReportsService, MAX_PER_DAY, type ReportsDeps } from '@/modules/reports/service';
import { eraseUserExports, exportKey } from '@/modules/reports/storage';
import { createSleepService } from '@/modules/sleep/service';
import { createBodyService } from '@/modules/body/service';
import { createNutritionService } from '@/modules/nutrition/service';
import type { StorageProvider } from '@/adapters/storage/types';
import { createTestConsent } from './consent-helpers';
import {
  connectAdmin,
  createTestAuth,
  createVerifiedUser,
  runtimeDb,
  truncateAll,
  type TestAuth,
} from './helpers';

/**
 * Exportação e relatórios em arquivo (LEG-D03, ADR-0032): só com consentimento, arquivo cifrado fora de
 * storage público, download do dono dentro do prazo (relógio do banco), revogação vencendo os links,
 * eliminação apagando linhas e arquivos e AuditLog só com IDs. Dados 100% sintéticos.
 */
let admin: pg.Client;
let db: Db;
let t: TestAuth;
let deps: HealthDeps;
let storageDir: string;
let storage: LocalStorageProvider;
let kms: LocalKmsProvider;
const enqueued: Array<{ userId: string; jobId: string }> = [];
const silent = createLogger({ sink: () => {} });
const SECRET_NOTE = 'nota-secreta-sintetica-exportacao';
const decoder = new TextDecoder();

const notRendered = async (): Promise<never> => {
  throw new Error('relatório não usado neste teste');
};

function service(overrides: Partial<ReportsDeps> = {}) {
  return createReportsService({
    db,
    kms,
    storage,
    queue: {
      enqueue: async (_name, payload) => {
        enqueued.push(payload as { userId: string; jobId: string });
        return 'job';
      },
    },
    logger: silent,
    sourceFor: (userId) =>
      createOwnSource(userId, deps, (u, fn) => withConsentOn(db, u, 'health_data', fn)),
    render: {
      notice: () =>
        'Gerado em 07/10/2026. Material de autoacompanhamento, não é laudo nem avaliação clínica.',
      reportPdf: notRendered,
      reportJson: () => {
        throw new Error('não usado');
      },
      reportCsv: () => {
        throw new Error('não usado');
      },
    },
    linkHours: 24,
    timeZone: 'America/Sao_Paulo',
    today: () => '2026-10-07',
    ...overrides,
  });
}

async function person(dataMode: 'own' | 'demo' = 'own') {
  const u = await createVerifiedUser(t);
  const c = createTestConsent(db, t.clock);
  expect(
    await c.service.completeOnboarding(u.userId, {
      acceptTerms: true,
      acceptPrivacy: true,
      purposes: ['health_data'],
    }),
  ).toEqual({ ok: true });
  expect(await c.service.chooseDataMode(u.userId, dataMode)).toBe(true);
  return { ...u, consent: c.service };
}

async function seed(userId: string) {
  const sleep = await createSleepService(deps).create(userId, {
    bedAt: '2026-10-05T23:00',
    wakeAt: '2026-10-06T07:00',
    quality: 4,
    awakenings: 1,
    note: SECRET_NOTE,
  });
  const body = await createBodyService(deps).create(userId, {
    measuredAt: '2026-10-06T08:00',
    weightKg: 70,
    heightCm: 170,
    waistCm: 80,
    hipCm: 98,
  });
  expect(sleep.ok && body.ok).toBe(true);
}

async function auditActions(userId: string): Promise<string[]> {
  const { rows } = await admin.query<{ action: string }>(
    `SELECT action::text FROM audit_logs WHERE subject_user_id = $1 AND resource_type = 'data_export'
      ORDER BY created_at`,
    [userId],
  );
  return rows.map((r) => r.action);
}

beforeAll(async () => {
  admin = await connectAdmin();
  await truncateAll(admin);
  db = runtimeDb();
  t = createTestAuth(db);
  kms = new LocalKmsProvider(randomBytes(32).toString('base64'));
  deps = {
    run: (userId, fn) => withConsentOn(db, userId, 'health_data', fn),
    cipher: createFieldCipher(kms),
    timeZone: 'America/Sao_Paulo',
  };
  storageDir = await mkdtemp(path.join(os.tmpdir(), 'hm-exports-'));
  storage = new LocalStorageProvider(storageDir);
});

afterAll(async () => {
  await db.$disconnect();
  await admin.end();
  await rm(storageDir, { recursive: true, force: true });
});

describe('exportação completa (LEG-D03)', () => {
  it('pedido → geração → arquivo cifrado → download do dono, com AuditLog só de IDs', async () => {
    const a = await person();
    await seed(a.userId);
    const s = service();
    const req = await s.request(a.userId, { kind: 'full_export', format: 'json' });
    expect(req.status).toBe('queued');
    if (req.status !== 'queued') return;
    expect(enqueued.at(-1)).toEqual({ userId: a.userId, jobId: req.jobId });

    expect(await s.generate(a.userId, req.jobId)).toBe('ready');
    expect(await s.generate(a.userId, req.jobId)).toBe('skipped'); // idempotente

    // No storage, só o envelope cifrado: nenhum texto da pessoa em claro.
    const stored = (await storage.get(exportKey(a.userId, req.jobId))).body;
    expect(Buffer.from(stored).includes(Buffer.from(SECRET_NOTE))).toBe(false);
    expect(Buffer.from(stored).includes(Buffer.from(a.email))).toBe(false);

    const file = await s.download(a.userId, req.jobId);
    expect(file?.contentType).toContain('application/json');
    expect(file?.filename).toMatch(/^healthmind360-exportacao-\d{4}-\d{2}-\d{2}\.json$/);
    const json = decoder.decode(file?.body);
    const doc = JSON.parse(json) as {
      account: { email: string };
      tables: Record<string, { records: Array<Record<string, unknown>> }>;
    };
    expect(doc.account.email).toBe(a.email);
    expect(doc.tables.sleep?.records[0]?.note).toBe(SECRET_NOTE);
    expect(doc.tables.body_measurements?.records[0]).toMatchObject({ weightKg: 70, waistCm: 80 });
    // Sem IMC nem relação cintura/quadril (LEG-M06), sem hash ou segredo da conta.
    expect(mentionsInternalValue(json)).toBe(false);
    expect(json).not.toMatch(/passwordHash|totp|token|textHash/i);

    expect(await auditActions(a.userId)).toEqual([
      'data_export_requested',
      'data_export_downloaded',
    ]);
  });

  it('CSV: ZIP com uma planilha por tabela', async () => {
    const a = await person();
    await seed(a.userId);
    const s = service();
    const req = await s.request(a.userId, { kind: 'full_export', format: 'csv' });
    if (req.status !== 'queued') throw new Error(req.status);
    await s.generate(a.userId, req.jobId);
    const file = await s.download(a.userId, req.jobId);
    expect(file?.contentType).toBe('application/zip');
    const names = readZip(file?.body ?? new Uint8Array()).map((f) => f.name);
    expect(names).toEqual(
      expect.arrayContaining(['README.txt', 'sleep.csv', 'body_measurements.csv']),
    );
  });

  it('outra pessoa não vê, não baixa nem apaga', async () => {
    const a = await person();
    const b = await person();
    const s = service();
    const req = await s.request(a.userId, { kind: 'full_export', format: 'json' });
    if (req.status !== 'queued') throw new Error(req.status);
    await s.generate(a.userId, req.jobId);
    expect(await s.download(b.userId, req.jobId)).toBeNull();
    expect(await s.remove(b.userId, req.jobId)).toBe(false);
    expect(await s.list(b.userId)).toEqual([]);
    expect(await storage.exists(exportKey(a.userId, req.jobId))).toBe(true);
  });

  it('um pedido por vez, limite em 24 h e nada no modo demo', async () => {
    const a = await person();
    const s = service();
    const first = await s.request(a.userId, { kind: 'full_export', format: 'json' });
    expect(first.status).toBe('queued');
    expect((await s.request(a.userId, { kind: 'full_export', format: 'csv' })).status).toBe('busy');
    // Pedidos concorrentes: a trava por pessoa deixa passar só um.
    const b = await person();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => s.request(b.userId, { kind: 'full_export', format: 'json' })),
    );
    expect(results.filter((r) => r.status === 'queued')).toHaveLength(1);

    const c = await person();
    for (let i = 0; i < MAX_PER_DAY; i++) {
      const r = await s.request(c.userId, { kind: 'full_export', format: 'json' });
      if (r.status !== 'queued') throw new Error(r.status);
      await s.generate(c.userId, r.jobId);
    }
    expect((await s.request(c.userId, { kind: 'full_export', format: 'json' })).status).toBe(
      'limit',
    );

    const demo = await person('demo');
    expect((await s.request(demo.userId, { kind: 'full_export', format: 'json' })).status).toBe(
      'demo',
    );
  });

  it('link vencido não baixa (relógio do banco) e o job apaga o arquivo', async () => {
    const a = await person();
    const s = service();
    const req = await s.request(a.userId, { kind: 'full_export', format: 'json' });
    if (req.status !== 'queued') throw new Error(req.status);
    await s.generate(a.userId, req.jobId);
    await admin.query(
      `UPDATE data_export_jobs SET expires_at = now() - interval '1 second', updated_at = now()
        WHERE id = $1`,
      [req.jobId],
    );
    expect(await s.download(a.userId, req.jobId)).toBeNull();
    expect(await s.expireDue()).toBeGreaterThanOrEqual(1);
    expect(await storage.exists(exportKey(a.userId, req.jobId))).toBe(false);
    const { rows } = await admin.query<{ status: string }>(
      `SELECT status::text FROM data_export_jobs WHERE id = $1`,
      [req.jobId],
    );
    expect(rows[0]?.status).toBe('expired');
  });

  it('o banco recusa link com prazo acima de 24 h (LEG-D03)', async () => {
    const a = await person();
    const s = service();
    const req = await s.request(a.userId, { kind: 'full_export', format: 'json' });
    if (req.status !== 'queued') throw new Error(req.status);
    await expect(
      admin.query(
        `UPDATE data_export_jobs SET expires_at = now() + interval '25 hours', updated_at = now()
          WHERE id = $1`,
        [req.jobId],
      ),
    ).rejects.toThrow(/24 hours|data_export_jobs_expiry/);
  });

  it('a pessoa apaga o arquivo antes do prazo', async () => {
    const a = await person();
    const s = service();
    const req = await s.request(a.userId, { kind: 'full_export', format: 'json' });
    if (req.status !== 'queued') throw new Error(req.status);
    await s.generate(a.userId, req.jobId);
    expect(await s.remove(a.userId, req.jobId)).toBe(true);
    expect(await storage.exists(exportKey(a.userId, req.jobId))).toBe(false);
    expect(await auditActions(a.userId)).toContain('data_export_deleted');
  });
});

describe('consentimento (LEG-C04)', () => {
  it('sem consentimento: não pede, não gera e não baixa', async () => {
    const a = await person();
    const s = service();
    const ready = await s.request(a.userId, { kind: 'full_export', format: 'json' });
    if (ready.status !== 'queued') throw new Error(ready.status);
    await s.generate(a.userId, ready.jobId);
    await a.consent.revoke(a.userId, 'health_data');

    expect(await s.download(a.userId, ready.jobId)).toBeNull();
    expect(await s.list(a.userId)).toEqual([]);
    expect((await s.request(a.userId, { kind: 'full_export', format: 'json' })).status).toBe(
      'no_consent',
    );
    // A revogação venceu o link na mesma transação: o job apaga o arquivo.
    await s.expireDue();
    expect(await storage.exists(exportKey(a.userId, ready.jobId))).toBe(false);
  });

  it('revogação durante a geração: o arquivo não fica', async () => {
    const a = await person();
    const s = service();
    const req = await s.request(a.userId, { kind: 'full_export', format: 'json' });
    if (req.status !== 'queued') throw new Error(req.status);
    await a.consent.revoke(a.userId, 'health_data');
    expect(await s.generate(a.userId, req.jobId)).toBe('skipped');
    expect(await storage.exists(exportKey(a.userId, req.jobId))).toBe(false);
  });

  it('eliminação apaga as linhas e os arquivos da pessoa, não os de outra', async () => {
    const a = await person();
    const b = await person();
    const s = service();
    const ra = await s.request(a.userId, { kind: 'full_export', format: 'json' });
    const rb = await s.request(b.userId, { kind: 'full_export', format: 'json' });
    if (ra.status !== 'queued' || rb.status !== 'queued') throw new Error('seed');
    await s.generate(a.userId, ra.jobId);
    await s.generate(b.userId, rb.jobId);
    await a.consent.revoke(a.userId, 'health_data');
    await admin.query(
      `UPDATE users SET health_data_purge_at = now() - interval '1 minute' WHERE id = $1`,
      [a.userId],
    );
    const eliminator = createHealthDataEliminator({
      db,
      logger: silent,
      erasers: HEALTH_DATA_ERASERS,
      eraseObjects: (userId) => eraseUserExports(storage, userId),
    });
    expect(await eliminator.eliminate(a.userId)).toBe('eliminated');
    const rows = await withUserOn(
      db,
      a.userId,
      (tx) =>
        tx.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM public.data_export_jobs`,
    );
    expect(rows[0]?.n).toBe(0);
    const { rows: raw } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM data_export_jobs WHERE user_id = $1`,
      [a.userId],
    );
    expect(raw[0]?.n).toBe(0);
    expect(await storage.exists(exportKey(a.userId, ra.jobId))).toBe(false);
    expect(await storage.exists(exportKey(b.userId, rb.jobId))).toBe(true);
  });
});

describe('revisão de privacidade da 6a (ADR-0032)', () => {
  async function ready(userId: string, s = service()) {
    const req = await s.request(userId, { kind: 'full_export', format: 'json' });
    if (req.status !== 'queued') throw new Error(req.status);
    expect(await s.generate(userId, req.jobId)).toBe('ready');
    return req.jobId;
  }

  it('B1: nem o dono estende o link, mesmo mexendo em updated_at', async () => {
    const a = await person();
    const jobId = await ready(a.userId);
    await expect(
      withConsentOn(
        db,
        a.userId,
        'health_data',
        (tx) =>
          tx.$executeRaw`UPDATE public.data_export_jobs
           SET expires_at = expires_at + interval '1 hour', updated_at = now() + interval '1 hour'
         WHERE id = ${jobId}::uuid`,
      ),
    ).rejects.toThrow(/cannot be extended|longer than 24 hours/);
    // Encurtar continua permitido (vencer o link na hora).
    await withConsentOn(
      db,
      a.userId,
      'health_data',
      (tx) =>
        tx.$executeRaw`UPDATE public.data_export_jobs SET expires_at = now() WHERE id = ${jobId}::uuid`,
    );
  });

  it('M1/B3: apagar vence o link na hora, some da lista e continua contando no limite', async () => {
    const a = await person();
    const s = service();
    const jobId = await ready(a.userId, s);
    expect(await s.remove(a.userId, jobId)).toBe(true);
    expect(await storage.exists(exportKey(a.userId, jobId))).toBe(false);
    expect(await s.download(a.userId, jobId)).toBeNull();
    expect(await s.list(a.userId)).toEqual([]);
    const { rows } = await admin.query<{ status: string; deleted: boolean }>(
      `SELECT status::text, file_deleted_at IS NOT NULL AS deleted FROM data_export_jobs WHERE id = $1`,
      [jobId],
    );
    expect(rows[0]).toEqual({ status: 'expired', deleted: true });
    for (let i = 1; i < MAX_PER_DAY; i++) {
      const id = await ready(a.userId, s);
      await s.remove(a.userId, id);
    }
    expect((await s.request(a.userId, { kind: 'full_export', format: 'json' })).status).toBe(
      'limit',
    );
  });

  it('A2: falha no storage não perde o arquivo de vista; a próxima execução apaga', async () => {
    const a = await person();
    const jobId = await ready(a.userId);
    await admin.query(
      `UPDATE data_export_jobs SET expires_at = now() - interval '1 second' WHERE id = $1`,
      [jobId],
    );
    let fail = true;
    const flaky: StorageProvider = {
      id: 'flaky',
      put: (k, b, o) => storage.put(k, b, o),
      get: (k) => storage.get(k),
      exists: (k) => storage.exists(k),
      deletePrefix: (p) => storage.deletePrefix(p),
      delete: async (k) => {
        if (fail) throw new Error('storage fora do ar');
        await storage.delete(k);
      },
    };
    await service({ storage: flaky }).expireDue();
    expect(await storage.exists(exportKey(a.userId, jobId))).toBe(true);
    fail = false;
    expect(await service({ storage: flaky }).expireDue()).toBeGreaterThanOrEqual(1);
    expect(await storage.exists(exportKey(a.userId, jobId))).toBe(false);
  });

  it('B5: a linha sai 2 dias depois do arquivo', async () => {
    const a = await person();
    const s = service();
    const jobId = await ready(a.userId, s);
    await s.remove(a.userId, jobId);
    await admin.query(
      `ALTER TABLE data_export_jobs DISABLE TRIGGER data_export_jobs_guard;
       UPDATE data_export_jobs SET file_deleted_at = now() - interval '3 days' WHERE id = '${jobId}';
       ALTER TABLE data_export_jobs ENABLE TRIGGER data_export_jobs_guard;`,
    );
    await s.expireDue();
    const { rows } = await admin.query(`SELECT 1 FROM data_export_jobs WHERE id = $1`, [jobId]);
    expect(rows).toHaveLength(0);
  });

  it('A1: falha ao apagar os arquivos desfaz a eliminação; a nova tentativa conclui', async () => {
    const a = await person();
    const jobId = await ready(a.userId);
    await a.consent.revoke(a.userId, 'health_data');
    await admin.query(
      `UPDATE users SET health_data_purge_at = now() - interval '1 minute' WHERE id = $1`,
      [a.userId],
    );
    let fail = true;
    const eliminator = createHealthDataEliminator({
      db,
      logger: silent,
      erasers: HEALTH_DATA_ERASERS,
      eraseObjects: async (userId) => {
        if (fail) throw new Error('storage fora do ar');
        await eraseUserExports(storage, userId);
      },
    });
    await expect(eliminator.eliminate(a.userId)).rejects.toThrow();
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM data_export_jobs WHERE user_id = $1`,
      [a.userId],
    );
    expect(rows[0]?.n).toBe(1);
    fail = false;
    expect(await eliminator.eliminate(a.userId)).toBe('eliminated');
    expect(await storage.exists(exportKey(a.userId, jobId))).toBe(false);
  });

  it('M3: a estimativa de calorias guardada sai na exportação mesmo desligada', async () => {
    const a = await person();
    await admin.query(`UPDATE users SET calorie_estimate_enabled = true WHERE id = $1`, [a.userId]);
    const meal = await createNutritionService(deps).createMeal(a.userId, {
      eatenAt: '2026-10-06T12:30',
      category: 'lunch',
      kcalEstimate: 600,
    });
    expect(meal.ok).toBe(true);
    await admin.query(`UPDATE users SET calorie_estimate_enabled = false WHERE id = $1`, [
      a.userId,
    ]);
    const s = service();
    const jobId = await ready(a.userId, s);
    const file = await s.download(a.userId, jobId);
    const doc = JSON.parse(decoder.decode(file?.body)) as {
      tables: { meals: { records: Array<{ kcalEstimate: number | null }> } };
    };
    expect(doc.tables.meals.records[0]?.kcalEstimate).toBe(600);
  });
});
