import { z } from 'zod';
import type { JobQueue } from '@/adapters/jobs/types';
import type { MailProvider } from '@/adapters/mail/types';
import { localDay } from '@/lib/dates';
import { ConsentRequiredError } from '@/lib/errors';
import { nextOccurrence, willSend } from './schedule';
import type { RemindersService } from './service';
import type { ReminderRecord } from './types';

/**
 * Envio de lembretes pela JobQueue (§33, LEG-F05, ADR-0029). Roda no servidor: não depende do navegador.
 * - Payload só com IDs e o instante previsto (ADR-0007, LEG-R04).
 * - Cada execução agenda a próxima ocorrência antes de enviar (a cadeia não se perde se o envio falhar).
 * - Lembrete apagado, desligado ou com horário mudado: a cadeia antiga para sozinha (cancelamento de
 *   domínio, ADR-0020). Consentimento revogado: para sem reagendar (LEG-C04).
 * - No máximo um e-mail por lembrete por dia (`claimSend`); nada no horário silencioso, com o tipo
 *   desligado ou com mais de `REMINDER_LATE_MS` de atraso.
 * - O e-mail não leva conteúdo de saúde, nem o nome do hábito (ROPA T7): só um link para o app.
 */
export const REMINDER_JOB = 'reminder.dispatch';

/** Atraso máximo para ainda enviar (fila parada por horas não dispara lembretes velhos). */
export const REMINDER_LATE_MS = 2 * 60 * 60 * 1000;

const payloadSchema = z.object({
  reminderId: z.uuid(),
  userId: z.uuid(),
  due: z.number().int().positive(),
});

/** Chave única por lembrete e ocorrência: reagendar a mesma ocorrência não duplica o job. */
export function reminderKey(reminderId: string, due: number): string {
  return `reminder:${reminderId}:${Math.floor(due / 60_000)}`;
}

/** Agenda a próxima ocorrência depois de `after` (lembrete ativo). Idempotente pela `singletonKey`. */
export async function scheduleReminder(
  queue: JobQueue,
  userId: string,
  reminder: Pick<ReminderRecord, 'id' | 'timeMin' | 'weekdays' | 'enabled'>,
  after: Date,
  timeZone: string,
): Promise<void> {
  if (!reminder.enabled) return;
  const due = nextOccurrence(reminder, after, timeZone).getTime();
  await queue.enqueue(
    REMINDER_JOB,
    { reminderId: reminder.id, userId, due },
    { runAt: new Date(due), singletonKey: reminderKey(reminder.id, due) },
  );
}

export interface ReminderJobDeps {
  service: Pick<RemindersService, 'dispatchContext' | 'claimSend'>;
  mail: MailProvider;
  appUrl: string;
  timeZone: string;
  now?: () => Date;
}

export function registerReminderJobs(queue: JobQueue, deps: ReminderJobDeps): void {
  const now = deps.now ?? (() => new Date());
  queue.register(REMINDER_JOB, async (payload) => {
    const { reminderId, userId, due } = payloadSchema.parse(payload);
    let ctx: Awaited<ReturnType<RemindersService['dispatchContext']>>;
    try {
      ctx = await deps.service.dispatchContext(userId, reminderId);
    } catch (error) {
      if (error instanceof ConsentRequiredError) return;
      throw error;
    }
    if (!ctx || !ctx.reminder.enabled) return;
    // Horário ou dias mudaram desde o agendamento: outra cadeia já cuida da ocorrência certa.
    if (nextOccurrence(ctx.reminder, new Date(due - 1), deps.timeZone).getTime() !== due) return;

    await scheduleReminder(queue, userId, ctx.reminder, new Date(due), deps.timeZone);

    const { prefs, reminder } = ctx;
    // Hábito arquivado: a cadeia continua (volta a enviar se o hábito for reativado), mas não envia.
    if (!ctx.habitActive) return;
    if (!willSend(reminder, prefs)) return;
    if (now().getTime() - due > REMINDER_LATE_MS) return;
    if (
      !(await deps.service.claimSend(userId, reminderId, localDay(new Date(due), deps.timeZone)))
    ) {
      return;
    }
    const path = reminder.kind === 'habit' ? '/habitos' : '/inicio';
    await deps.mail.send({
      to: ctx.email,
      template: 'reminder',
      params: { link: new URL(path, deps.appUrl).toString() },
    });
  });
}
