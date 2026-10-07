import { z } from 'zod';
import { localDateTimeSchema, optionalInt, optionalText } from '@/modules/health/zod';

/** Entrada do formulário de sono (§20). Horários locais (`datetime-local`), convertidos no serviço. */
export const sleepInputSchema = z
  .object({
    bedAt: localDateTimeSchema,
    wakeAt: localDateTimeSchema,
    quality: optionalInt(1, 5),
    awakenings: optionalInt(0, 50),
    note: optionalText(1000),
  })
  .refine((v) => v.wakeAt > v.bedAt, { path: ['wakeAt'], message: 'wake_before_bed' });

export type SleepInput = z.infer<typeof sleepInputSchema>;

export const SLEEP_MAX_HOURS = 24;
