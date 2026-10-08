import { eraseBodyData } from '@/modules/body/eraser';
import { eraseHabitsData } from '@/modules/habits/eraser';
import { eraseJournalData } from '@/modules/journal/eraser';
import { eraseMoodData } from '@/modules/mood/eraser';
import type { HealthDataErasers } from '@/modules/privacy/health-data';
import { eraseSleepData } from '@/modules/sleep/eraser';

/**
 * Eliminadores de TODAS as tabelas de saúde (ADR-0019/0021, LEG-D04, PR1b-B9), injetados no eliminador por
 * `@/modules/privacy/server`. Tabela de saúde nova = eliminador aqui. `tests/db/health.test.ts` descobre as
 * tabelas pelo catálogo do banco e falha se alguma não for zerada pelo eliminador de produção.
 */
export const HEALTH_DATA_ERASERS: HealthDataErasers = {
  sleep: eraseSleepData,
  mood: eraseMoodData,
  habits: eraseHabitsData,
  journal: eraseJournalData,
  body: eraseBodyData,
};
