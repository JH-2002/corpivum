'use server';

import { getTranslations } from 'next-intl/server';
import type { FormState } from '@/components/forms/form-state';
import { activityInputSchema, setsFromForm } from '@/modules/activity';
import { requireAppSession } from '@/modules/consent/server';
import { fieldErrorsOf, healthMutate, healthWrite } from '@/modules/health/form-result';
import { getHealthServices } from '@/modules/health/server';
import { idSchema } from '@/modules/health/zod';

/**
 * Atividade (§26, LEG-M08): criar/editar e excluir. Sessão + onboarding, Zod, consentimento (serviço +
 * RLS). Séries chegam em listas paralelas; linhas vazias são ignoradas.
 */
export async function saveActivityAction(_prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireAppSession();
  const parsed = activityInputSchema.safeParse({
    startedAt: form.get('startedAt'),
    type: form.get('type'),
    durationMin: form.get('durationMin'),
    intensity: form.get('intensity'),
    distanceKm: form.get('distanceKm'),
    note: form.get('note'),
    sets: setsFromForm(form.getAll('setExercise'), form.getAll('setReps'), form.getAll('setLoad')),
  });
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const t = await getTranslations('forms');
  return healthWrite(session, async () => {
    const service = getHealthServices().activity;
    const rawId = form.get('id');
    if (rawId) {
      const id = idSchema.safeParse(rawId);
      const result = id.success ? await service.update(session.userId, id.data, parsed.data) : null;
      if (!result) return { status: 'error', message: t('notFound') };
      if (!result.ok) return { status: 'error', message: t(`errors.${result.error}`) };
      return { status: 'success', message: t('updated') };
    }
    const result = await service.create(session.userId, parsed.data);
    if (!result.ok) return { status: 'error', message: t(`errors.${result.error}`) };
    return { status: 'success', message: t('saved') };
  });
}

export async function deleteActivityAction(form: FormData): Promise<void> {
  const session = await requireAppSession();
  const id = idSchema.safeParse(form.get('id'));
  if (!id.success) return;
  await healthMutate(session, () => getHealthServices().activity.remove(session.userId, id.data));
}
