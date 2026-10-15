import 'server-only';
import { getAdapters } from '@/adapters';
import { withUser, type Tx } from '@/lib/db';
import { APP_TIME_ZONE, localDay } from '@/lib/dates';
import { readTourSeen, writeTourSeen } from './preferences';
import { createActivityService, type ActivityService } from '@/modules/activity/service';
import { createBodyService, type BodyService } from '@/modules/body/service';
import { withConsent } from '@/modules/consent/server';
import { createGoalsService, type GoalsService } from '@/modules/goals/service';
import { createHabitsService, type HabitsService } from '@/modules/habits/service';
import { createRemindersService, type RemindersService } from '@/modules/notifications/service';
import type { ReminderPrefs } from '@/modules/notifications';
import { createNutritionService, type NutritionService } from '@/modules/nutrition/service';
import { createSleepService, type SleepService } from '@/modules/sleep/service';
import { createDemoSource, type HealthDataSource } from './source';
import { generateDemoData } from '@/modules/demo/generator';
import { createFieldCipher, type HealthDeps } from './core';

/**
 * Integração dos módulos de saúde com o Next (somente servidor). Todo acesso roda com consentimento
 * `health_data` ativo na mesma transação (guard) e o RLS repete a checagem no banco (ADR-0021).
 */
let deps: HealthDeps | undefined;

function healthDeps(): HealthDeps {
  deps ??= {
    run: (userId, fn) => withConsent(userId, 'health_data', fn),
    cipher: createFieldCipher(getAdapters().kms),
    timeZone: APP_TIME_ZONE,
  };
  return deps;
}

interface HealthServices {
  sleep: SleepService;
  habits: HabitsService;
  body: BodyService;
  nutrition: NutritionService;
  activity: ActivityService;
  goals: GoalsService;
  reminders: RemindersService;
}

let services: HealthServices | undefined;

export function getHealthServices(): HealthServices {
  if (!services) {
    const d = healthDeps();
    services = servicesWith(d);
  }
  return services;
}

/** Hoje no fuso da pessoa. */
export function todayIso(now: Date = new Date()): string {
  return localDay(now, APP_TIME_ZONE);
}

/** Preferência de sequências de hábitos (LEG-F05). Não é dado de saúde: só `app.user_id`. */
export async function setStreaksEnabled(userId: string, enabled: boolean): Promise<void> {
  await withUser(userId, (tx) =>
    tx.user.update({ where: { id: userId }, data: { streaksEnabled: enabled } }),
  );
}

/** Estimativa calórica nas refeições (LEG-M07): desligada por padrão; só a própria pessoa liga. */
export async function setCalorieEstimateEnabled(userId: string, enabled: boolean): Promise<void> {
  await withUser(userId, (tx) =>
    tx.user.update({ where: { id: userId }, data: { calorieEstimateEnabled: enabled } }),
  );
}

/** Preferências de lembrete (§33, §46): por tipo e horário silencioso. Não é dado de saúde. */
export async function setReminderPrefs(userId: string, prefs: ReminderPrefs): Promise<void> {
  await withUser(userId, (tx) => tx.user.update({ where: { id: userId }, data: { ...prefs } }));
}

/** Tour do painel já visto ou pulado (ADR-0025). Preferência de interface, não é dado de saúde. */
export function hasSeenTour(userId: string): Promise<boolean> {
  return withUser(userId, (tx) => readTourSeen(tx, userId));
}

/** Marca o tour como visto (concluído ou pulado). Reabrir pelo menu de ajuda não depende disto. */
export async function markTourSeen(userId: string): Promise<void> {
  await withUser(userId, (tx) => writeTourSeen(tx, userId));
}

function servicesWith(d: HealthDeps): HealthServices {
  return {
    sleep: createSleepService(d),
    habits: createHabitsService(d),
    body: createBodyService(d),
    nutrition: createNutritionService(d),
    activity: createActivityService(d),
    goals: createGoalsService(d),
    reminders: createRemindersService(d),
  };
}

/** Abre a transação com consentimento de `session` (no Next: `withConsent`; nos testes: banco de testes). */
export type ConsentTx = <T>(userId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;

const consentTx: ConsentTx = (userId, fn) => withConsent(userId, 'health_data', fn);

/** Dados da própria pessoa (consentimento + RLS em toda leitura). */
export function createOwnSource(
  userId: string,
  bound?: HealthDeps,
  openSession: ConsentTx = consentTx,
): HealthDataSource {
  const d = bound ?? healthDeps();
  const s = bound ? servicesWith(bound) : getHealthServices();
  const { run } = d;
  return {
    kind: 'own',
    sleep: (range, opts) => s.sleep.list(userId, range, opts),
    habits: (opts) => s.habits.listHabits(userId, opts),
    checks: (range) => s.habits.listChecks(userId, range),
    body: (range) => s.body.list(userId, range),
    latestHeightCm: () => s.body.latestHeightCm(userId),
    latestWeightKg: () => s.body.latestWeightKg(userId),
    meals: (range, opts) => s.nutrition.listMeals(userId, range, opts),
    water: (range) => s.nutrition.listWater(userId, range),
    activities: (range, opts) => s.activity.list(userId, range, opts),
    goals: (opts) => s.goals.list(userId, opts),
    reminders: () => s.reminders.list(userId),
    reminderPrefs: () => s.reminders.prefs(userId),
    calorieEstimateEnabled: () => s.nutrition.calorieEstimateEnabled(userId),
    streaksEnabled: () =>
      run(userId, async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { streaksEnabled: true },
        });
        return user?.streaksEnabled ?? true;
      }),
    hasAnyRecord: () =>
      run(userId, async (tx) => {
        const found = await Promise.all([
          tx.sleepEntry.findFirst({ select: { id: true } }),
          tx.habit.findFirst({ select: { id: true } }),
          tx.bodyMeasurement.findFirst({ select: { id: true } }),
          tx.mealEntry.findFirst({ select: { id: true } }),
          tx.waterEntry.findFirst({ select: { id: true } }),
          tx.activityEntry.findFirst({ select: { id: true } }),
        ]);
        return found.some((row) => row !== null);
      }),
    // Uma transação com consentimento; os serviços dentro dela reutilizam o mesmo `tx`.
    session: (fn) =>
      openSession(userId, (tx) =>
        fn(createOwnSource(userId, { ...d, run: (_user, inner) => inner(tx) }, openSession)),
      ),
  };
}

/** Dados fictícios de demonstração (LEG-X02), gerados em memória para `today`. */
export function createDemoSourceFor(today: string): HealthDataSource {
  return createDemoSource(generateDemoData(today, APP_TIME_ZONE));
}
