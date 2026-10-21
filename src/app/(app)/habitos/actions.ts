'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { FormState } from '@/components/forms/form-state';
import { ConsentRequiredError } from '@/lib/errors';
import { habitCheckSchema, habitInputSchema, streaksSchema } from '@/modules/habits';
import { requireAppSession } from '@/modules/consent/server';
import { healthMutate } from '@/modules/health/form-result';
import { getHealthServices, setStreaksEnabled } from '@/modules/health/server';
import { idSchema } from '@/modules/health/zod';
import { assertFullApp } from '@/lib/full-app';

/**
 * Hábitos (§22). Toda action revalida a sessão e o onboarding (requireAppSession), valida com Zod e
 * grava só com consentimento ativo (serviço + RLS). No modo demo nada é gravado (ADR-0021).
 */
function readHabit(form: FormData) {
  return habitInputSchema.safeParse({
    name: form.get('name'),
    frequency: form.get('frequency'),
    weekdays: form.getAll('weekdays'),
    timesPerWeek: form.get('timesPerWeek'),
  });
}

export async function saveHabitAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  const session = await requireAppSession();
  const t = await getTranslations('forms');
  if (session.dataMode !== 'own') return { status: 'error', message: t('demoReadOnly') };
  const parsed = readHabit(form);
  if (!parsed.success) return { status: 'error', message: t('invalid') };
  const rawId = form.get('id');
  try {
    const habits = getHealthServices().habits;
    if (rawId) {
      const id = idSchema.safeParse(rawId);
      if (!id.success || !(await habits.update(session.userId, id.data, parsed.data))) {
        return { status: 'error', message: t('notFound') };
      }
    } else {
      await habits.create(session.userId, parsed.data);
    }
  } catch (error) {
    if (error instanceof ConsentRequiredError) return { status: 'error', message: t('consent') };
    throw error;
  }
  revalidatePath('/', 'layout');
  return { status: 'success', message: rawId ? t('updated') : t('saved') };
}

const idForm = (form: FormData) => idSchema.safeParse(form.get('id'));

export async function archiveHabitAction(form: FormData): Promise<void> {
  assertFullApp();
  const session = await requireAppSession();
  const id = idForm(form);
  if (!id.success) return;
  await healthMutate(session, () =>
    getHealthServices().habits.setArchived(
      session.userId,
      id.data,
      form.get('archived') === 'true',
    ),
  );
}

export async function deleteHabitAction(form: FormData): Promise<void> {
  assertFullApp();
  const session = await requireAppSession();
  const id = idForm(form);
  if (!id.success) return;
  await healthMutate(session, () => getHealthServices().habits.remove(session.userId, id.data));
}

/** Check rápido (dashboard e página de hábitos). */
export async function setHabitCheckAction(form: FormData): Promise<void> {
  assertFullApp();
  const session = await requireAppSession();
  const parsed = habitCheckSchema.safeParse({
    habitId: form.get('habitId'),
    day: form.get('day'),
    done: form.get('done'),
  });
  if (!parsed.success) return;
  const { habitId, day, done } = parsed.data;
  await healthMutate(session, () =>
    getHealthServices().habits.setCheck(session.userId, habitId, day, done),
  );
}

/** Sequências (streaks) desativáveis, sem mensagem punitiva (LEG-F05). */
export async function setStreaksAction(form: FormData): Promise<void> {
  assertFullApp();
  const session = await requireAppSession();
  const parsed = streaksSchema.safeParse({ enabled: form.get('enabled') });
  if (!parsed.success) return;
  await setStreaksEnabled(session.userId, parsed.data.enabled);
  revalidatePath('/', 'layout');
}
