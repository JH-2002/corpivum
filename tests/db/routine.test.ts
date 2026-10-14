import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { MemoryJobQueue } from '@/adapters/jobs/memory';
import { LocalKmsProvider } from '@/adapters/kms/local';
import { ConsoleMailProvider } from '@/adapters/mail/console';
import type { Db } from '@/lib/db/client';
import { withUserOn } from '@/lib/db/rls';
import { createLogger } from '@/lib/logger';
import { createBodyService } from '@/modules/body/service';
import { withConsentOn } from '@/modules/consent/guard';
import { goalInputSchema } from '@/modules/goals';
import { createGoalsService } from '@/modules/goals/service';
import { createHabitsService } from '@/modules/habits/service';
import { createFieldCipher, type HealthDeps } from '@/modules/health/core';
import { reminderInputSchema } from '@/modules/notifications';
import { registerReminderJobs, scheduleReminder } from '@/modules/notifications/jobs';
import { createRemindersService } from '@/modules/notifications/service';
import { createNutritionService } from '@/modules/nutrition/service';
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
 * Fase 4 no banco (ADR-0029): guardrails das metas aplicados no servidor com os dados do banco (LEG-M04,
 * LEG-M07), estimativa calórica desligada por padrão e lembretes processados pela fila, sem conteúdo de
 * saúde no e-mail e sem insistência (LEG-F05). Dados 100% sintéticos.
 */
let admin: pg.Client;
let db: Db;
let t: TestAuth;
let deps: HealthDeps;
const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-10-07T15:00:00Z'); // 12:00 local
const SECRET_HABIT = 'habito-secreto-do-lembrete';

const ALL = { acceptTerms: true, acceptPrivacy: true } as const;

async function onboarded() {
  const u = await createVerifiedUser(t);
  const c = createTestConsent(db, t.clock);
  expect(
    await c.service.completeOnboarding(u.userId, { ...ALL, purposes: ['health_data'] }),
  ).toEqual({ ok: true });
  return { ...u, consent: c.service };
}

const goal = (raw: Record<string, string>) => goalInputSchema.parse(raw);

async function count(table: string, userId: string): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public."${table}" WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.n ?? -1;
}

const setEstimate = (userId: string, enabled: boolean) =>
  withUserOn(db, userId, (tx) =>
    tx.user.update({ where: { id: userId }, data: { calorieEstimateEnabled: enabled } }),
  );

beforeAll(async () => {
  admin = await connectAdmin();
  await truncateAll(admin);
  db = runtimeDb();
  t = createTestAuth(db);
  deps = {
    run: (userId, fn) => withConsentOn(db, userId, 'health_data', fn),
    cipher: createFieldCipher(new LocalKmsProvider(randomBytes(32).toString('base64'))),
    timeZone: TZ,
    now: () => NOW,
  };
});

afterAll(async () => {
  await db.$disconnect();
  await admin.end();
});

describe('metas: guardrails no servidor com dados do banco (LEG-M04, LEG-M07)', () => {
  it('meta de perda insegura é bloqueada e nada é gravado; ganho e manutenção passam', async () => {
    const a = await onboarded();
    const body = createBodyService(deps);
    const goals = createGoalsService(deps);
    await body.create(a.userId, { measuredAt: '2026-10-06T08:00', weightKg: 60, heightCm: 175 });

    // 175 cm: IMC 18,5 ≈ 56,7 kg.
    expect(
      await goals.create(
        a.userId,
        goal({ metric: 'weight_kg', targetValue: '55', targetDay: '2027-10-07' }),
      ),
    ).toEqual({ ok: false, reasons: ['target_below_safe_range'] });
    expect(
      await goals.create(
        a.userId,
        goal({ metric: 'weight_kg', targetValue: '58', targetDay: '2026-10-21' }),
      ),
    ).toEqual({ ok: false, reasons: ['pace_too_fast'] });
    expect(await count('goals', a.userId)).toBe(0);

    const gain = await goals.create(a.userId, goal({ metric: 'weight_kg', targetValue: '64' }));
    const keep = await goals.create(a.userId, goal({ metric: 'weight_kg', targetValue: '60' }));
    expect(gain.ok && keep.ok).toBe(true);
    const list = await goals.list(a.userId);
    // O peso de partida vem do banco, não do formulário.
    expect(list.map((g) => g.startValue)).toEqual([60, 60]);
  });

  it('meta de peso sem peso registrado é recusada; a altura vem só do banco', async () => {
    const a = await onboarded();
    const goals = createGoalsService(deps);
    expect(await goals.create(a.userId, goal({ metric: 'weight_kg', targetValue: '70' }))).toEqual({
      ok: false,
      reasons: ['current_weight_required'],
    });
    await createBodyService(deps).create(a.userId, {
      measuredAt: '2026-10-06T08:00',
      weightKg: 80,
    });
    expect(
      await goals.create(
        a.userId,
        goal({ metric: 'weight_kg', targetValue: '78', targetDay: '2027-01-07' }),
      ),
    ).toEqual({ ok: false, reasons: ['height_required'] });
  });

  it('edição reaplica o guardrail', async () => {
    const a = await onboarded();
    await createBodyService(deps).create(a.userId, {
      measuredAt: '2026-10-06T08:00',
      weightKg: 80,
      heightCm: 175,
    });
    const goals = createGoalsService(deps);
    const created = await goals.create(
      a.userId,
      goal({ metric: 'weight_kg', targetValue: '78', targetDay: '2027-01-07' }),
    );
    if (!created.ok) throw new Error('meta');
    expect(
      await goals.update(
        a.userId,
        created.id,
        goal({ metric: 'weight_kg', targetValue: '70', targetDay: '2026-11-07' }),
      ),
    ).toEqual({ ok: false, reasons: ['pace_too_fast'] });
    const [stored] = await goals.list(a.userId);
    expect(stored?.targetValue).toBe(78);
  });

  it('meta de calorias: só com a estimativa ligada e nunca abaixo do piso (também no banco)', async () => {
    const a = await onboarded();
    const goals = createGoalsService(deps);
    expect(
      await goals.create(a.userId, goal({ metric: 'kcal_reference_day', targetValue: '2000' })),
    ).toEqual({ ok: false, reasons: ['estimate_disabled'] });
    await setEstimate(a.userId, true);
    expect(
      await goals.create(a.userId, goal({ metric: 'kcal_reference_day', targetValue: '1200' })),
    ).toEqual({ ok: false, reasons: ['calorie_target_below_floor'] });
    expect(
      (await goals.create(a.userId, goal({ metric: 'kcal_reference_day', targetValue: '2000' })))
        .ok,
    ).toBe(true);
    // Mesmo sem o serviço, o banco recusa meta calórica abaixo do piso.
    await expect(
      withConsentOn(db, a.userId, 'health_data', (tx) =>
        tx.goal.create({
          data: {
            userId: a.userId,
            domain: 'nutrition',
            metric: 'kcal_reference_day',
            targetValue: 1000,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

describe('estimativa calórica (LEG-M07)', () => {
  it('desligada por padrão: caloria recusada; desligar oculta sem apagar', async () => {
    const a = await onboarded();
    const nutrition = createNutritionService(deps);
    expect(await nutrition.calorieEstimateEnabled(a.userId)).toBe(false);
    expect(
      await nutrition.createMeal(a.userId, {
        eatenAt: '2026-10-06T12:00',
        category: 'lunch',
        kcalEstimate: 600,
      }),
    ).toEqual({ ok: false, error: 'estimate_disabled' });

    await setEstimate(a.userId, true);
    const meal = await nutrition.createMeal(a.userId, {
      eatenAt: '2026-10-06T12:00',
      category: 'lunch',
      kcalEstimate: 600,
    });
    if (!meal.ok) throw new Error('refeição');
    const range = { from: '2026-10-01', to: '2026-10-07' };
    expect((await nutrition.listMeals(a.userId, range))[0]?.kcalEstimate).toBe(600);

    await setEstimate(a.userId, false);
    expect((await nutrition.listMeals(a.userId, range))[0]?.kcalEstimate).toBeNull();
    // Editar com a estimativa desligada não apaga o valor guardado.
    await nutrition.updateMeal(a.userId, meal.id, {
      eatenAt: '2026-10-06T12:30',
      category: 'lunch',
    });
    const { rows } = await admin.query<{ kcal: number }>(
      `SELECT kcal_estimate AS kcal FROM meal_entries WHERE id = $1`,
      [meal.id],
    );
    expect(rows[0]?.kcal).toBe(600);
  });
});

describe('lembretes pela fila (§33, LEG-F05)', () => {
  async function setup(time = '20:00') {
    const a = await onboarded();
    const habits = createHabitsService(deps);
    const habitId = await habits.create(a.userId, {
      name: SECRET_HABIT,
      frequency: 'daily',
      weekdays: [],
      timesPerWeek: null,
    });
    const reminders = createRemindersService(deps);
    const created = await reminders.create(
      a.userId,
      reminderInputSchema.parse({ kind: 'habit', habitId, time }),
    );
    if (!created.ok) throw new Error('lembrete');
    const queue = new MemoryJobQueue(createLogger({ sink: () => {} }));
    const mail = new ConsoleMailProvider({
      logger: createLogger({ sink: () => {} }),
      keepOutbox: true,
    });
    let clock = NOW;
    registerReminderJobs(queue, {
      service: reminders,
      mail,
      appUrl: 'http://localhost:3000',
      timeZone: TZ,
      now: () => clock,
    });
    await scheduleReminder(queue, a.userId, created.reminder, NOW, TZ);
    const runAt = async (iso: string) => {
      clock = new Date(iso);
      return queue.drain(clock);
    };
    return { a, habitId, reminders, reminder: created.reminder, queue, mail, runAt };
  }

  it('envia no horário, sem conteúdo de saúde, e agenda o dia seguinte', async () => {
    const { a, mail, runAt } = await setup();
    // 20:00 local = 23:00 UTC.
    expect(await runAt('2026-10-07T22:59:00Z')).toBe(0);
    expect(await runAt('2026-10-07T23:00:30Z')).toBe(1);
    expect(mail.outbox).toHaveLength(1);
    const sent = mail.outbox[0];
    expect(sent?.to).toBe(a.email);
    expect(sent?.template).toBe('reminder');
    expect(sent?.params).toEqual({ link: 'http://localhost:3000/habitos' });
    expect(JSON.stringify(sent)).not.toContain(SECRET_HABIT);
    expect(await runAt('2026-10-08T23:00:30Z')).toBe(1);
    expect(mail.outbox).toHaveLength(2);
  });

  it('no máximo um envio por lembrete por dia, mesmo com execução repetida', async () => {
    const { a, reminder, reminders, mail, runAt } = await setup();
    await runAt('2026-10-07T23:00:30Z');
    expect(await reminders.claimSend(a.userId, reminder.id, '2026-10-07')).toBe(false);
    expect(mail.outbox).toHaveLength(1);
  });

  it('horário silencioso e tipo desligado: não envia, mas a cadeia continua', async () => {
    const { a, mail, runAt } = await setup('23:30');
    await withUserOn(db, a.userId, (tx) =>
      tx.user.update({
        where: { id: a.userId },
        data: { quietStartMin: 22 * 60, quietEndMin: 7 * 60 },
      }),
    );
    expect(await runAt('2026-10-08T02:30:30Z')).toBe(1);
    expect(mail.outbox).toHaveLength(0);
    await withUserOn(db, a.userId, (tx) =>
      tx.user.update({
        where: { id: a.userId },
        data: { quietStartMin: null, quietEndMin: null, remindHabits: false },
      }),
    );
    expect(await runAt('2026-10-09T02:30:30Z')).toBe(1);
    expect(mail.outbox).toHaveLength(0);
  });

  it('lembrete desligado, com horário mudado ou apagado: a cadeia antiga para', async () => {
    const { a, reminder, reminders, mail, runAt, queue } = await setup();
    await reminders.update(
      a.userId,
      reminder.id,
      reminderInputSchema.parse({ kind: 'habit', habitId: reminder.habitId, time: '21:00' }),
    );
    // O job das 20:00 roda e encontra o horário mudado: não envia nem reagenda.
    expect(await runAt('2026-10-07T23:00:30Z')).toBe(1);
    expect(mail.outbox).toHaveLength(0);
    expect(await runAt('2026-10-08T23:00:30Z')).toBe(0);
    await reminders.remove(a.userId, reminder.id);
    await scheduleReminder(queue, a.userId, { ...reminder, timeMin: 21 * 60 }, NOW, TZ);
    expect(await runAt('2026-10-08T00:00:30Z')).toBe(1);
    expect(mail.outbox).toHaveLength(0);
  });

  it('revogar o consentimento interrompe os envios (LEG-C04)', async () => {
    const { a, mail, runAt } = await setup();
    await a.consent.revoke(a.userId, 'health_data');
    expect(await runAt('2026-10-07T23:00:30Z')).toBe(1);
    expect(mail.outbox).toHaveLength(0);
    expect(await runAt('2026-10-08T23:00:30Z')).toBe(0);
  });

  it('fila parada por horas não dispara lembrete velho', async () => {
    const { mail, runAt } = await setup();
    expect(await runAt('2026-10-08T03:00:00Z')).toBe(1);
    expect(mail.outbox).toHaveLength(0);
  });
});

describe('preferências na conta (concessão por coluna)', () => {
  it('o runtime altera as preferências novas da própria conta', async () => {
    const a = await onboarded();
    await withUserOn(db, a.userId, (tx) =>
      tx.user.update({
        where: { id: a.userId },
        data: {
          calorieEstimateEnabled: true,
          remindDailyLog: false,
          quietStartMin: 1320,
          quietEndMin: 420,
        },
      }),
    );
    // Horário silencioso pela metade é recusado pelo banco.
    await expect(
      withUserOn(db, a.userId, (tx) =>
        tx.user.update({ where: { id: a.userId }, data: { quietEndMin: null } }),
      ),
    ).rejects.toThrow();
  });
});
