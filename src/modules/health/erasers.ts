import { eraseBodyData } from '@/modules/body/eraser';
import { eraseHabitsData } from '@/modules/habits/eraser';
import { eraseJournalData } from '@/modules/journal/eraser';
import { eraseMoodData } from '@/modules/mood/eraser';
import { registerHealthDataEraser, type HealthDataEraser } from '@/modules/privacy/health-data';
import { eraseSleepData } from '@/modules/sleep/eraser';

/**
 * Eliminadores de TODAS as tabelas de saúde (ADR-0019/0021, LEG-D04, PR1b-B9). Tabela de saúde nova =
 * eliminador aqui. `tests/db/health-coverage.test.ts` descobre as tabelas pelo catálogo do banco e falha
 * se alguma não for zerada por estes eliminadores.
 */
export const HEALTH_DATA_ERASERS: Readonly<Record<string, HealthDataEraser>> = {
  sleep: eraseSleepData,
  mood: eraseMoodData,
  habits: eraseHabitsData,
  journal: eraseJournalData,
  body: eraseBodyData,
};

let registered = false;

/** Registra os eliminadores no job de eliminação. Idempotente; chamado ao iniciar os jobs. */
export function registerAllHealthDataErasers(): void {
  if (registered) return;
  for (const [module, eraser] of Object.entries(HEALTH_DATA_ERASERS)) {
    registerHealthDataEraser(module, eraser);
  }
  registered = true;
}
