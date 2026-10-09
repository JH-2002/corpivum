import 'server-only';
import { getAdapters } from '@/adapters';
import { withUser } from '@/lib/db';
import { APP_TIME_ZONE, localDay } from '@/lib/dates';
import { readTourSeen, writeTourSeen } from './preferences';
import { createBodyService, type BodyService } from '@/modules/body/service';
import { withConsent } from '@/modules/consent/server';
import { createHabitsService, type HabitsService } from '@/modules/habits/service';
import { createJournalService, type JournalService } from '@/modules/journal/service';
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
  journal: JournalService;
  body: BodyService;
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
    journal: createJournalService(d),
    body: createBodyService(d),
  };
}

/** Dados da própria pessoa (consentimento + RLS em toda leitura). */
export function createOwnSource(userId: string, bound?: HealthDeps): HealthDataSource {
  const d = bound ?? healthDeps();
  const s = bound ? servicesWith(bound) : getHealthServices();
  const { run } = d;
  return {
    kind: 'own',
    sleep: (range, opts) => s.sleep.list(userId, range, opts),
    habits: (opts) => s.habits.listHabits(userId, opts),
    checks: (range) => s.habits.listChecks(userId, range),
    journal: (range, opts) => s.journal.list(userId, range, opts),
    body: (range) => s.body.list(userId, range),
    latestHeightCm: () => s.body.latestHeightCm(userId),
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
          tx.journalEntry.findFirst({ select: { id: true } }),
          tx.bodyMeasurement.findFirst({ select: { id: true } }),
        ]);
        return found.some((row) => row !== null);
      }),
    // Uma transação com consentimento; os serviços dentro dela reutilizam o mesmo `tx`.
    session: (fn) =>
      withConsent(userId, 'health_data', (tx) =>
        fn(createOwnSource(userId, { ...healthDeps(), run: (_user, inner) => inner(tx) })),
      ),
  };
}

/** Dados fictícios de demonstração (LEG-X02), gerados em memória para `today`. */
export function createDemoSourceFor(today: string): HealthDataSource {
  return createDemoSource(generateDemoData(today, APP_TIME_ZONE));
}
