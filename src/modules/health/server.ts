import 'server-only';
import { getAdapters } from '@/adapters';
import { APP_TIME_ZONE } from '@/lib/dates';
import { createBodyService, type BodyService } from '@/modules/body/service';
import { withConsent } from '@/modules/consent/server';
import { createHabitsService, type HabitsService } from '@/modules/habits/service';
import { createJournalService, type JournalService } from '@/modules/journal/service';
import { createMoodService, type MoodService } from '@/modules/mood/service';
import { createSleepService, type SleepService } from '@/modules/sleep/service';
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
  mood: MoodService;
  habits: HabitsService;
  journal: JournalService;
  body: BodyService;
}

let services: HealthServices | undefined;

export function getHealthServices(): HealthServices {
  if (!services) {
    const d = healthDeps();
    services = {
      sleep: createSleepService(d),
      mood: createMoodService(d),
      habits: createHabitsService(d),
      journal: createJournalService(d),
      body: createBodyService(d),
    };
  }
  return services;
}
