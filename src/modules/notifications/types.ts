export const REMINDER_KINDS = ['habit', 'daily_log'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/** Lembrete como a interface recebe (§33). */
export interface ReminderRecord {
  id: string;
  kind: ReminderKind;
  habitId: string | null;
  /** Minuto do dia (0–1439) no fuso da pessoa. */
  timeMin: number;
  /** Dias da semana (0 = domingo). Vazio = todos os dias. */
  weekdays: number[];
  enabled: boolean;
}

/** Preferências de lembrete da conta (§33, §46): por tipo e horário silencioso. */
export interface ReminderPrefs {
  remindHabits: boolean;
  remindDailyLog: boolean;
  quietStartMin: number | null;
  quietEndMin: number | null;
}

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = Object.freeze({
  remindHabits: true,
  remindDailyLog: true,
  quietStartMin: null,
  quietEndMin: null,
});

/** Máximo de lembretes por conta: sem notificação insistente (LEG-F05). */
export const MAX_REMINDERS = 10;
