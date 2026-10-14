/**
 * Módulo `notifications` (§33, LEG-F05, ADR-0029): lembretes processados no servidor pela JobQueue. API
 * pública sem dependência de servidor: tipos, schemas e agenda. Serviço: `./service`; jobs: `./jobs`.
 */
export {
  reminderInputSchema,
  reminderPrefsSchema,
  reminderToggleSchema,
  type ReminderInput,
  type ReminderPrefsInput,
} from './schemas';
export * from './schedule';
export * from './types';
