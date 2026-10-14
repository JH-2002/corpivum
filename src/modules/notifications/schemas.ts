import { z } from 'zod';
import { idSchema } from '@/modules/health/zod';
import { parseTime } from './schedule';
import { REMINDER_KINDS } from './types';

const emptyToUndefined = (v: unknown) =>
  v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v;

/** `HH:MM` de um `<input type="time">`, com hora e minuto reais. */
const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .refine((v) => {
    const [h, m] = v.split(':').map(Number) as [number, number];
    return h < 24 && m < 60;
  })
  .transform(parseTime);

const checkbox = z.preprocess((v) => v === 'on' || v === 'true', z.boolean());

/** Lembrete (§33). Dias vazios = todos os dias. */
export const reminderInputSchema = z
  .object({
    kind: z.enum(REMINDER_KINDS),
    habitId: z.preprocess(emptyToUndefined, idSchema.optional()),
    time: timeSchema,
    weekdays: z
      .array(z.coerce.number().int().min(0).max(6))
      .max(7)
      .default([])
      .transform((l) => [...new Set(l)].sort((a, b) => a - b)),
  })
  .refine((v) => v.kind !== 'habit' || v.habitId !== undefined, {
    path: ['habitId'],
    message: 'habit_required',
  })
  .transform((v) => ({
    kind: v.kind,
    habitId: v.kind === 'habit' ? (v.habitId ?? null) : null,
    timeMin: v.time,
    // Todos os dias marcados = sem restrição.
    weekdays: v.weekdays.length === 7 ? [] : v.weekdays,
  }));
export type ReminderInput = z.output<typeof reminderInputSchema>;

/** Preferências: lembretes por tipo e horário silencioso (os dois horários, ou nenhum). */
export const reminderPrefsSchema = z
  .object({
    remindHabits: checkbox,
    remindDailyLog: checkbox,
    quietStart: z.preprocess(emptyToUndefined, timeSchema.optional()),
    quietEnd: z.preprocess(emptyToUndefined, timeSchema.optional()),
  })
  .refine((v) => (v.quietStart === undefined) === (v.quietEnd === undefined), {
    path: ['quietEnd'],
    message: 'quiet_both',
  })
  .refine((v) => v.quietStart === undefined || v.quietStart !== v.quietEnd, {
    path: ['quietEnd'],
    message: 'quiet_both',
  })
  .transform((v) => ({
    remindHabits: v.remindHabits,
    remindDailyLog: v.remindDailyLog,
    quietStartMin: v.quietStart ?? null,
    quietEndMin: v.quietEnd ?? null,
  }));
export type ReminderPrefsInput = z.output<typeof reminderPrefsSchema>;

export const reminderToggleSchema = z.object({
  id: idSchema,
  enabled: z.enum(['true', 'false']).transform((v) => v === 'true'),
});
