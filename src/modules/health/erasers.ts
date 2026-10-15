import { eraseActivityData } from '@/modules/activity/eraser';
import { eraseBodyData } from '@/modules/body/eraser';
import { eraseGoalsData } from '@/modules/goals/eraser';
import { eraseHabitsData } from '@/modules/habits/eraser';
import { eraseRemindersData } from '@/modules/notifications/eraser';
import { eraseNutritionData } from '@/modules/nutrition/eraser';
import type { HealthDataErasers } from '@/modules/privacy/health-data';
import { eraseExportJobs } from '@/modules/reports/eraser';
import { eraseSleepData } from '@/modules/sleep/eraser';

/**
 * Eliminadores de TODAS as tabelas de saúde (ADR-0019/0021, LEG-D04, PR1b-B9), injetados no eliminador por
 * `@/modules/privacy/server`. Tabela de saúde nova = eliminador aqui. `tests/db/health.test.ts` descobre as
 * tabelas pelo catálogo do banco e falha se alguma não for zerada pelo eliminador de produção. Metas e
 * lembretes saem antes dos hábitos que eles referenciam.
 */
export const HEALTH_DATA_ERASERS: HealthDataErasers = {
  sleep: eraseSleepData,
  goals: eraseGoalsData,
  reminders: eraseRemindersData,
  habits: eraseHabitsData,
  body: eraseBodyData,
  nutrition: eraseNutritionData,
  activity: eraseActivityData,
  // Pedidos de exportação (ADR-0032); os arquivos no storage saem pelo `eraseObjects` do eliminador.
  exports: eraseExportJobs,
};
