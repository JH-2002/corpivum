import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { LocalKmsProvider } from '@/adapters/kms/local';
import type { Db } from '@/lib/db/client';
import { withUserOn, type Tx } from '@/lib/db/rls';
import { ConsentRequiredError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { createActivityService } from '@/modules/activity/service';
import { createBodyService } from '@/modules/body/service';
import { withConsentOn } from '@/modules/consent/guard';
import { goalInputSchema } from '@/modules/goals';
import { createGoalsService } from '@/modules/goals/service';
import { createHabitsService } from '@/modules/habits/service';
import { reminderInputSchema } from '@/modules/notifications';
import { createRemindersService } from '@/modules/notifications/service';
import { createNutritionService } from '@/modules/nutrition/service';
import { createFieldCipher, type HealthDeps } from '@/modules/health/core';
import { HEALTH_DATA_ERASERS } from '@/modules/health/erasers';
import { createHealthDataEliminator } from '@/modules/privacy/health-data';
import { createSleepService } from '@/modules/sleep/service';
import { createTestConsent } from './consent-helpers';
import {
  connectAdmin,
  createTestAuth,
  createVerifiedUser,
  runtimeDb,
  truncateAll,
  type TestAuth,
} from './helpers';
import { readTourSeen, writeTourSeen } from '@/modules/health/preferences';

/**
 * Tabelas de saúde da Fase 2 (ADR-0021): RLS por dono E consentimento (LEG-S03, LEG-C04, PR1b-N1),
 * isolamento entre pessoas, cifragem de campo (LEG-S02) e cobertura da eliminação agendada (LEG-D04,
 * PR1b-B9). Dados 100% sintéticos.
 */
let admin: pg.Client;
let db: Db;
let t: TestAuth;
let deps: HealthDeps;
const TZ = 'America/Sao_Paulo';

/** Tabelas de saúde conhecidas. Tabela nova com `user_id` precisa ser classificada aqui ou em NON_HEALTH. */
const HEALTH_TABLES = [
  'activity_entries',
  'body_measurements',
  'data_export_jobs',
  'goals',
  'habit_checks',
  'habits',
  'meal_entries',
  'reminders',
  'sleep_entries',
  'strength_sets',
  'water_entries',
];
/** Tabelas com `user_id` que NÃO são dado de saúde (auth, provas, logs). */
const NON_HEALTH = new Set([
  'sessions',
  'recovery_codes',
  'auth_tokens',
  'reauth_proofs',
  'consent_records',
  'policy_acceptances',
  'privacy_requests',
  'access_logs',
  'test_health_fixture',
]);

const ALL = { acceptTerms: true, acceptPrivacy: true } as const;

function services() {
  return {
    sleep: createSleepService(deps),
    habits: createHabitsService(deps),
    body: createBodyService(deps),
    nutrition: createNutritionService(deps),
    activity: createActivityService(deps),
    goals: createGoalsService(deps),
    reminders: createRemindersService(deps),
  };
}

async function onboarded(purposes: Array<'health_data'>) {
  const u = await createVerifiedUser(t);
  const c = createTestConsent(db, t.clock);
  expect(await c.service.completeOnboarding(u.userId, { ...ALL, purposes })).toEqual({ ok: true });
  return { ...u, consent: c.service };
}

const RANGE = { from: '2026-09-01', to: '2026-10-07' };
const SECRET_NOTE = 'nota-secreta-sintetica-sono';
const SECRET_HABIT = 'habito-secreto-sintetico';
const SECRET_MEAL = 'refeicao-secreta-sintetica';
const SECRET_EXERCISE = 'exercicio-secreto-sintetico';

/** Um registro em cada tabela de saúde, pelos serviços reais. */
async function seedAll(userId: string) {
  const s = services();
  const sleep = await s.sleep.create(userId, {
    bedAt: '2026-10-05T23:00',
    wakeAt: '2026-10-06T07:00',
    quality: 4,
    awakenings: 1,
    note: SECRET_NOTE,
  });
  const habitId = await s.habits.create(userId, {
    name: SECRET_HABIT,
    frequency: 'daily',
    weekdays: [],
    timesPerWeek: null,
  });
  expect(await s.habits.setCheck(userId, habitId, '2026-10-06', true)).toBe('ok');
  const body = await s.body.create(userId, { measuredAt: '2026-10-06T08:00', weightKg: 70 });
  const meal = await s.nutrition.createMeal(userId, {
    eatenAt: '2026-10-06T12:30',
    category: 'lunch',
    description: SECRET_MEAL,
  });
  const water = await s.nutrition.addWater(userId, { day: '2026-10-06', ml: 300 });
  const activity = await s.activity.create(userId, {
    startedAt: '2026-10-06T18:00',
    type: 'strength',
    durationMin: 40,
    sets: [{ exercise: SECRET_EXERCISE, reps: 10, loadKg: 20 }],
  });
  const goal = await s.goals.create(
    userId,
    goalInputSchema.parse({ metric: 'habit_completion_pct', targetValue: '80', habitId }),
  );
  const reminder = await s.reminders.create(
    userId,
    reminderInputSchema.parse({ kind: 'habit', habitId, time: '21:00' }),
  );
  if (!sleep.ok || !body.ok || !meal.ok || !water.ok || !activity.ok || !goal.ok || !reminder.ok) {
    throw new Error('seed');
  }
  // Pedido de exportação (ADR-0032): tabela de saúde, no mesmo modelo de políticas.
  const exportJob = await deps.run(userId, (tx) =>
    tx.dataExportJob.create({ data: { userId, kind: 'full_export', format: 'json' } }),
  );
  return {
    exportId: exportJob.id,
    sleepId: sleep.id,
    habitId,
    bodyId: body.id,
    mealId: meal.id,
    waterId: water.id,
    activityId: activity.id,
    goalId: goal.id,
    reminderId: reminder.reminder.id,
  };
}

async function countsFor(userId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of HEALTH_TABLES) {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public."${table}" WHERE user_id = $1`,
      [userId],
    );
    out[table] = rows[0]?.n ?? -1;
  }
  return out;
}

beforeAll(async () => {
  admin = await connectAdmin();
  await truncateAll(admin);
  db = runtimeDb();
  t = createTestAuth(db);
  // Relógio do teste em 2026-10-07 12:00 local: os registros sintéticos ficam no passado.
  deps = {
    run: (userId, fn) => withConsentOn(db, userId, 'health_data', fn),
    cipher: createFieldCipher(new LocalKmsProvider(randomBytes(32).toString('base64'))),
    timeZone: TZ,
    now: () => new Date('2026-10-07T15:00:00Z'),
  };
});

afterAll(async () => {
  await db.$disconnect();
  await admin.end();
});

describe('catálogo: toda tabela de saúde segue o modelo (PR1b-N1)', () => {
  it('tabelas com user_id são saúde (lista fechada) ou explicitamente não-saúde', async () => {
    const { rows } = await admin.query<{ table: string }>(
      `SELECT c.relname AS table FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attname = 'user_id' AND NOT a.attisdropped`,
    );
    const health = rows.map((r) => r.table).filter((x) => !NON_HEALTH.has(x));
    // Tabela nova? Se for de saúde, entra em HEALTH_TABLES, no modelo de políticas e no eliminador.
    expect(health.sort()).toEqual(HEALTH_TABLES);
  });

  it.each(HEALTH_TABLES)(
    '%s: RLS; SELECT/INSERT/UPDATE com dono + consentimento; DELETE só por dono',
    async (table) => {
      const rls = await admin.query<{ on: boolean }>(
        `SELECT relrowsecurity AS on FROM pg_class WHERE oid = $1::regclass`,
        [`public.${table}`],
      );
      expect(rls.rows[0]?.on).toBe(true);
      const { rows } = await admin.query<{
        cmd: string;
        qual: string | null;
        check: string | null;
      }>(
        `SELECT cmd, qual, with_check AS check FROM pg_policies
          WHERE schemaname = 'public' AND tablename = $1`,
        [table],
      );
      expect(rows.map((r) => r.cmd).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
      const consent = /app\.has_active_consent\('health_data'::consent_purpose\)/;
      const owner = /user_id = \( SELECT app\.current_user_id\(\)/;
      for (const p of rows) {
        const exprs = [p.qual, p.check].filter((e): e is string => e !== null);
        expect(exprs.length).toBeGreaterThan(0);
        for (const e of exprs) {
          expect(e).toMatch(owner);
          if (p.cmd === 'DELETE') expect(e).not.toMatch(/has_active_consent/);
          else expect(e).toMatch(consent);
        }
      }
      const fk = await admin.query<{ action: string }>(
        `SELECT confdeltype AS action FROM pg_constraint
          WHERE contype = 'f' AND conrelid = $1::regclass AND confrelid = 'public.users'::regclass`,
        [`public.${table}`],
      );
      expect(fk.rows).toEqual([{ action: 'c' }]);
    },
  );

  it('o runtime não pode TRUNCATE (ignoraria o RLS)', async () => {
    for (const table of HEALTH_TABLES) {
      await expect(db.$executeRawUnsafe(`TRUNCATE public."${table}"`)).rejects.toThrow(
        /permission denied/,
      );
    }
  });
});

describe('eliminação agendada cobre todas as tabelas de saúde (LEG-D04, PR1b-B9)', () => {
  it('após o prazo, zera A em todas as tabelas e não toca em B', async () => {
    const a = await onboarded(['health_data']);
    const b = await onboarded(['health_data']);
    await seedAll(a.userId);
    await seedAll(b.userId);
    const before = await countsFor(a.userId);
    for (const table of HEALTH_TABLES) expect(before[table]).toBeGreaterThan(0);
    const bBefore = await countsFor(b.userId);

    await a.consent.revoke(a.userId, 'health_data');
    await admin.query(
      `UPDATE users SET health_data_purge_at = now() - interval '1 minute' WHERE id = $1`,
      [a.userId],
    );
    // Lista de produção, a mesma injetada por @/modules/privacy/server.
    const objects: string[] = [];
    const eliminator = createHealthDataEliminator({
      db,
      logger: createLogger({ sink: () => {} }),
      erasers: HEALTH_DATA_ERASERS,
      eraseObjects: async (userId) => void objects.push(userId),
    });
    expect(await eliminator.eliminate(a.userId)).toBe('eliminated');
    // Arquivos de exportação (fora do banco) também saem, só os da própria pessoa (PR1b-B9).
    expect(objects).toEqual([a.userId]);

    const after = await countsFor(a.userId);
    for (const table of HEALTH_TABLES) expect(after[table]).toBe(0);
    expect(await countsFor(b.userId)).toEqual(bBefore);
  });

  it('sem eliminadores, falha em vez de dar a eliminação como feita (revisão M1)', () => {
    expect(() =>
      createHealthDataEliminator({
        db,
        logger: createLogger({ sink: () => {} }),
        erasers: {},
        eraseObjects: async () => {},
      }),
    ).toThrow();
  });

  it('um eliminador com WHERE não apagaria nada após a revogação (motivo do DELETE sem WHERE)', async () => {
    const a = await onboarded(['health_data']);
    await seedAll(a.userId);
    await a.consent.revoke(a.userId, 'health_data');
    const deleted = await withUserOn(
      db,
      a.userId,
      (tx) => tx.$executeRaw`DELETE FROM public.sleep_entries WHERE user_id = ${a.userId}::uuid`,
    );
    expect(deleted).toBe(0);
    const viaEraser = await withUserOn(db, a.userId, (tx) => HEALTH_DATA_ERASERS.sleep!(tx));
    expect(viaEraser).toBe(1);
  });
});

describe('isolamento entre pessoas (LEG-S03)', () => {
  it('B não lê, não altera e não apaga os registros de A', async () => {
    const s = services();
    const a = await onboarded(['health_data']);
    const b = await onboarded(['health_data']);
    const ids = await seedAll(a.userId);

    expect(await s.sleep.list(b.userId, RANGE)).toEqual([]);
    expect(await s.habits.listHabits(b.userId)).toEqual([]);
    expect(await s.habits.listChecks(b.userId, RANGE)).toEqual([]);
    expect(await s.body.list(b.userId, RANGE)).toEqual([]);
    expect(await s.nutrition.listMeals(b.userId, RANGE)).toEqual([]);
    expect(await s.nutrition.listWater(b.userId, RANGE)).toEqual([]);
    expect(await s.activity.list(b.userId, RANGE)).toEqual([]);
    expect(await s.goals.list(b.userId)).toEqual([]);
    expect(await s.reminders.list(b.userId)).toEqual([]);

    expect(
      await s.sleep.update(b.userId, ids.sleepId, {
        bedAt: '2026-10-05T22:00',
        wakeAt: '2026-10-06T06:00',
      }),
    ).toBeNull();
    expect(await s.sleep.remove(b.userId, ids.sleepId)).toBe(false);
    expect(await s.habits.remove(b.userId, ids.habitId)).toBe(false);
    expect(await s.habits.setCheck(b.userId, ids.habitId, '2026-10-06', false)).toBe('not_found');
    expect(await s.body.remove(b.userId, ids.bodyId)).toBe(false);
    expect(await s.nutrition.removeMeal(b.userId, ids.mealId)).toBe(false);
    expect(await s.nutrition.removeWater(b.userId, ids.waterId)).toBe(false);
    expect(await s.activity.remove(b.userId, ids.activityId)).toBe(false);
    expect(await s.goals.remove(b.userId, ids.goalId)).toBe(false);
    expect(await s.goals.setArchived(b.userId, ids.goalId, true)).toBe(false);
    expect(await s.reminders.remove(b.userId, ids.reminderId)).toBe(false);
    expect(await s.reminders.setEnabled(b.userId, ids.reminderId, false)).toBeNull();
    expect(await s.reminders.claimSend(b.userId, ids.reminderId, '2026-10-07')).toBe(false);
    // B não aponta meta nem lembrete para o hábito de A.
    expect(
      await s.goals.create(
        b.userId,
        goalInputSchema.parse({
          metric: 'habit_completion_pct',
          targetValue: '80',
          habitId: ids.habitId,
        }),
      ),
    ).toEqual({ ok: false, error: 'habit_not_found' });

    const counts = await countsFor(a.userId);
    for (const table of HEALTH_TABLES) expect(counts[table]).toBe(1);
  });

  it('FK composta: série, meta e lembrete nunca apontam para registro de outra pessoa', async () => {
    const a = await onboarded(['health_data']);
    const b = await onboarded(['health_data']);
    const ids = await seedAll(a.userId);
    const attempts: Array<(tx: Tx) => Promise<unknown>> = [
      (tx) =>
        tx.strengthSet.create({
          data: {
            userId: b.userId,
            activityId: ids.activityId,
            exerciseNameEnc: new Uint8Array([1]),
            setIndex: 9,
            reps: 1,
          },
        }),
      (tx) =>
        tx.goal.create({
          data: {
            userId: b.userId,
            domain: 'habits',
            metric: 'habit_completion_pct',
            targetValue: 50,
            habitId: ids.habitId,
            habitUserId: b.userId,
          },
        }),
      (tx) =>
        tx.reminder.create({
          data: {
            userId: b.userId,
            kind: 'habit',
            habitId: ids.habitId,
            habitUserId: a.userId,
            timeMin: 600,
            weekdays: [],
          },
        }),
    ];
    for (const write of attempts) {
      await expect(withConsentOn(db, b.userId, 'health_data', write)).rejects.toThrow();
    }
  });

  it('B não grava em nome de A (WITH CHECK) nem marca check no hábito de A (FK composta)', async () => {
    const a = await onboarded(['health_data']);
    const b = await onboarded(['health_data']);
    const ids = await seedAll(a.userId);
    await expect(
      withConsentOn(db, b.userId, 'health_data', (tx) =>
        tx.bodyMeasurement.create({
          data: { userId: a.userId, measuredAt: new Date('2026-10-01T10:00:00Z'), weightKg: 60 },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withConsentOn(db, b.userId, 'health_data', (tx) =>
        tx.habitCheck.create({
          data: { userId: b.userId, habitId: ids.habitId, day: new Date('2026-10-05T00:00:00Z') },
        }),
      ),
    ).rejects.toThrow();
  });
});

describe('consentimento no banco, não só na aplicação (LEG-C04)', () => {
  it('após revogar: o serviço recusa e o RLS sozinho não mostra nem aceita nada', async () => {
    const s = services();
    const a = await onboarded(['health_data']);
    await seedAll(a.userId);
    await a.consent.revoke(a.userId, 'health_data');

    await expect(s.sleep.list(a.userId, RANGE)).rejects.toBeInstanceOf(ConsentRequiredError);
    await expect(
      s.body.create(a.userId, { measuredAt: '2026-10-06T10:00', weightKg: 70 }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);

    // Sem o guard da aplicação: só `app.user_id`. Exceção única: os pedidos de EXPORTAÇÃO COMPLETA (só metadados,
    // sem conteúdo de saúde) continuam visíveis na carência, para a pessoa exportar até a eliminação (OI-32).
    for (const table of HEALTH_TABLES.filter((t) => t !== 'data_export_jobs')) {
      const n = await withUserOn(db, a.userId, async (tx) => {
        const rows = await tx.$queryRawUnsafe<Array<{ n: number }>>(
          `SELECT count(*)::int AS n FROM public."${table}"`,
        );
        return rows[0]?.n ?? -1;
      });
      expect(n).toBe(0);
      const updated = await withUserOn(db, a.userId, (tx) =>
        tx.$executeRawUnsafe(`UPDATE public."${table}" SET updated_at = now()`),
      );
      expect(updated).toBe(0);
    }
    const exportsVisible = await withUserOn(
      db,
      a.userId,
      (tx) => tx.$queryRaw<Array<{ kind: string }>>`SELECT kind::text FROM public.data_export_jobs`,
    );
    expect(exportsVisible.map((r) => r.kind)).toEqual(['full_export']);
    await expect(
      withUserOn(db, a.userId, (tx) =>
        tx.sleepEntry.create({
          data: {
            userId: a.userId,
            bedAt: new Date('2026-10-01T02:00:00Z'),
            wakeAt: new Date('2026-10-01T10:00:00Z'),
          },
        }),
      ),
    ).rejects.toThrow();
    // Continuam guardados até a eliminação agendada.
    expect((await countsFor(a.userId)).sleep_entries).toBe(1);
  });

  it('sem consentimento de saúde, nada é gravado', async () => {
    const s = services();
    const c = await onboarded([]);
    await expect(
      s.body.create(c.userId, { measuredAt: '2026-10-06T08:00', weightKg: 70 }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
    await expect(
      withUserOn(db, c.userId, (tx) =>
        tx.bodyMeasurement.create({
          data: { userId: c.userId, measuredAt: new Date('2026-10-01T10:00:00Z'), weightKg: 60 },
        }),
      ),
    ).rejects.toThrow();
  });
});

describe('cifragem de campo (LEG-S02)', () => {
  it('texto livre não aparece em claro no banco e só abre com o contexto da dona', async () => {
    const a = await onboarded(['health_data']);
    const b = await onboarded(['health_data']);
    await seedAll(a.userId);
    const { rows } = await admin.query<{ note: Buffer; name: Buffer }>(
      `SELECT (SELECT note_enc FROM sleep_entries WHERE user_id = $1) AS note,
              (SELECT name_enc FROM habits WHERE user_id = $1) AS name`,
      [a.userId],
    );
    const row = rows[0];
    if (!row) throw new Error('sem linha');
    expect(row.note.includes(Buffer.from(SECRET_NOTE))).toBe(false);
    expect(row.name.includes(Buffer.from(SECRET_HABIT))).toBe(false);

    const field = { table: 'sleep_entries', column: 'note_enc' };
    expect(await deps.cipher.open(a.userId, field, row.note)).toBe(SECRET_NOTE);
    await expect(deps.cipher.open(b.userId, field, row.note)).rejects.toThrow();
    await expect(
      deps.cipher.open(a.userId, { table: 'habits', column: 'name_enc' }, row.note),
    ).rejects.toThrow();

    const [entry] = await services().sleep.list(a.userId, RANGE, { withText: true });
    expect(entry?.note).toBe(SECRET_NOTE);
    const [meta] = await services().sleep.list(a.userId, RANGE);
    expect(meta?.note).toBeNull();

    const routine = await admin.query<{ meal: Buffer; exercise: Buffer }>(
      `SELECT (SELECT description_enc FROM meal_entries WHERE user_id = $1) AS meal,
              (SELECT exercise_name_enc FROM strength_sets WHERE user_id = $1) AS exercise`,
      [a.userId],
    );
    const enc = routine.rows[0];
    if (!enc) throw new Error('sem linha');
    expect(enc.meal.includes(Buffer.from(SECRET_MEAL))).toBe(false);
    expect(enc.exercise.includes(Buffer.from(SECRET_EXERCISE))).toBe(false);
    const [meal] = await services().nutrition.listMeals(a.userId, RANGE, { withText: true });
    expect(meal?.description).toBe(SECRET_MEAL);
    const [mealMeta] = await services().nutrition.listMeals(a.userId, RANGE);
    expect(mealMeta?.description).toBeNull();
    const [activity] = await services().activity.list(a.userId, RANGE);
    expect(activity?.sets[0]?.exercise).toBe(SECRET_EXERCISE);
  });
});

describe('validações do banco', () => {
  it('recusa valores fora de faixa mesmo vindos do runtime', async () => {
    const a = await onboarded(['health_data']);
    const bad: Array<(tx: Tx) => Promise<unknown>> = [
      async (tx: Tx) =>
        tx.sleepEntry.create({
          data: {
            userId: a.userId,
            bedAt: new Date('2026-10-02T10:00:00Z'),
            wakeAt: new Date('2026-10-01T10:00:00Z'),
          },
        }),
      async (tx: Tx) =>
        tx.bodyMeasurement.create({ data: { userId: a.userId, measuredAt: new Date() } }),
      async (tx: Tx) =>
        tx.habit.create({
          data: {
            userId: a.userId,
            nameEnc: new Uint8Array([1]),
            frequency: 'weekdays',
            weekdays: [],
          },
        }),
    ];
    for (const write of bad) {
      await expect(withConsentOn(db, a.userId, 'health_data', write)).rejects.toThrow();
    }
  });
});

describe('pedido de revisão do Índice de Bem-Estar (LEG-D08, LEG-D07)', () => {
  const review = (userId: string, version = 1, from = '2026-09-08', to = '2026-10-07') =>
    withUserOn(db, userId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT app.privacy_request_score_review(${version}::smallint, ${from}::date, ${to}::date)::text AS id`;
      return rows[0]?.id ?? '';
    });

  it('abre um pedido automated_review com versão e período, prazo de 15 dias, e AuditLog', async () => {
    const a = await onboarded(['health_data']);
    const id = await review(a.userId);
    const { rows } = await admin.query(
      `SELECT kind, status, score_version, period_start::text, period_end::text,
              round(extract(epoch FROM due_at - created_at) / 86400)::int AS days
         FROM privacy_requests WHERE id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({
      kind: 'automated_review',
      status: 'open',
      score_version: 1,
      period_start: '2026-09-08',
      period_end: '2026-10-07',
      days: 15,
    });
    const audit = await admin.query(
      `SELECT action, actor_user_id FROM audit_logs WHERE resource_id = $1`,
      [id],
    );
    expect(audit.rows).toEqual([{ action: 'privacy_request_created', actor_user_id: a.userId }]);
    // Idempotente com pedido aberto.
    expect(await review(a.userId)).toBe(id);
  });

  it('chamadas simultâneas criam um só pedido (revisão B1)', async () => {
    const a = await onboarded(['health_data']);
    const ids = await Promise.all([review(a.userId), review(a.userId), review(a.userId)]);
    expect(new Set(ids).size).toBe(1);
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM privacy_requests WHERE user_id = $1`,
      [a.userId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('recusa sem contexto e com escopo inválido', async () => {
    const a = await onboarded(['health_data']);
    await expect(
      db.$queryRaw`SELECT app.privacy_request_score_review(1::smallint, '2026-09-01'::date, '2026-09-30'::date)`,
    ).rejects.toThrow();
    await expect(review(a.userId, 0)).rejects.toThrow();
    await expect(review(a.userId, 1, '2026-10-07', '2026-09-01')).rejects.toThrow();
  });
});

describe('escolha do passo 5 (§52.5)', () => {
  it('só grava depois do onboarding, e o runtime altera só as colunas permitidas', async () => {
    const pending = await createVerifiedUser(t);
    const c = createTestConsent(db, t.clock);
    expect(await c.service.chooseDataMode(pending.userId, 'demo')).toBe(false);
    await c.service.completeOnboarding(pending.userId, { ...ALL, purposes: [] });
    expect((await c.service.getState(pending.userId)).dataMode).toBeNull();
    expect(await c.service.chooseDataMode(pending.userId, 'demo')).toBe(true);
    expect((await c.service.getState(pending.userId)).dataMode).toBe('demo');
    await withUserOn(db, pending.userId, (tx) =>
      tx.user.update({ where: { id: pending.userId }, data: { streaksEnabled: false } }),
    );
    // Tour do painel visto (ADR-0025): coluna nova liberada só para UPDATE dela mesma; idempotente.
    expect(await withUserOn(db, pending.userId, (tx) => readTourSeen(tx, pending.userId))).toBe(
      false,
    );
    await withUserOn(db, pending.userId, (tx) => writeTourSeen(tx, pending.userId));
    await withUserOn(db, pending.userId, (tx) => writeTourSeen(tx, pending.userId));
    expect(await withUserOn(db, pending.userId, (tx) => readTourSeen(tx, pending.userId))).toBe(
      true,
    );
    // Sem `app.user_id`, a leitura não acha a conta (RLS).
    expect(await db.$transaction((tx) => readTourSeen(tx, pending.userId))).toBe(false);
    await expect(
      withUserOn(db, pending.userId, (tx) =>
        tx.user.update({ where: { id: pending.userId }, data: { ageGateVersion: 'x' } }),
      ),
    ).rejects.toThrow();
  });
});
