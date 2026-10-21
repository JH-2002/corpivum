'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getAdapters } from '@/adapters';
import type { FormState } from '@/components/forms/form-state';
import { APP_TIME_ZONE } from '@/lib/dates';
import { requireAppSession } from '@/modules/consent/server';
import { fieldErrorsOf, healthMutate, healthWrite } from '@/modules/health/form-result';
import { getHealthServices, setReminderPrefs } from '@/modules/health/server';
import { idSchema } from '@/modules/health/zod';
import {
  reminderInputSchema,
  reminderPrefsSchema,
  reminderToggleSchema,
  type ReminderRecord,
} from '@/modules/notifications';
import { scheduleReminder } from '@/modules/notifications/jobs';
import { assertFullApp } from '@/lib/full-app';

/**
 * Lembretes (§33, LEG-F05): criar/editar, pausar/retomar, excluir e preferências. Ao salvar ou retomar,
 * agenda a próxima ocorrência na JobQueue (idempotente pela `singletonKey`); a cadeia antiga para sozinha.
 */
async function schedule(userId: string, reminder: ReminderRecord): Promise<void> {
  await scheduleReminder(getAdapters().jobs, userId, reminder, new Date(), APP_TIME_ZONE);
}

export async function saveReminderAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  const session = await requireAppSession();
  const parsed = reminderInputSchema.safeParse({
    kind: form.get('kind'),
    habitId: form.get('habitId'),
    time: form.get('time'),
    weekdays: form.getAll('weekdays'),
  });
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const t = await getTranslations('forms');
  return healthWrite(session, async () => {
    const service = getHealthServices().reminders;
    const rawId = form.get('id');
    let result;
    if (rawId) {
      const id = idSchema.safeParse(rawId);
      result = id.success ? await service.update(session.userId, id.data, parsed.data) : null;
    } else {
      result = await service.create(session.userId, parsed.data);
    }
    if (!result) return { status: 'error', message: t('notFound') };
    if (!result.ok) return { status: 'error', message: t(`errors.${result.error}`) };
    await schedule(session.userId, result.reminder);
    return { status: 'success', message: rawId ? t('updated') : t('saved') };
  });
}

export async function toggleReminderAction(form: FormData): Promise<void> {
  assertFullApp();
  const session = await requireAppSession();
  const parsed = reminderToggleSchema.safeParse({
    id: form.get('id'),
    enabled: form.get('enabled'),
  });
  if (!parsed.success) return;
  await healthMutate(session, async () => {
    const reminder = await getHealthServices().reminders.setEnabled(
      session.userId,
      parsed.data.id,
      parsed.data.enabled,
    );
    if (reminder) await schedule(session.userId, reminder);
  });
}

export async function deleteReminderAction(form: FormData): Promise<void> {
  assertFullApp();
  const session = await requireAppSession();
  const id = idSchema.safeParse(form.get('id'));
  if (!id.success) return;
  await healthMutate(session, () => getHealthServices().reminders.remove(session.userId, id.data));
}

/** Preferências por tipo e horário silencioso (não é dado de saúde). Só com dados próprios. */
export async function saveReminderPrefsAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  assertFullApp();
  const session = await requireAppSession();
  const t = await getTranslations();
  if (session.dataMode !== 'own') return { status: 'error', message: t('forms.demoReadOnly') };
  const parsed = reminderPrefsSchema.safeParse({
    remindHabits: form.get('remindHabits'),
    remindDailyLog: form.get('remindDailyLog'),
    quietStart: form.get('quietStart'),
    quietEnd: form.get('quietEnd'),
  });
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  await setReminderPrefs(session.userId, parsed.data);
  revalidatePath('/', 'layout');
  return { status: 'success', message: t('reminders.prefs.saved') };
}
