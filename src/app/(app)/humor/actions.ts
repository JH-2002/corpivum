'use server';

import { getTranslations } from 'next-intl/server';
import type { FormState } from '@/components/forms/form-state';
import { requireAppSession } from '@/modules/consent/server';
import { fieldErrorsOf, healthMutate, healthWrite } from '@/modules/health/form-result';
import { getHealthServices } from '@/modules/health/server';
import { idSchema } from '@/modules/health/zod';
import { LOW_MOOD_SUPPORT_THRESHOLD, moodInputSchema } from '@/modules/mood';

/**
 * Humor/energia/estresse (§21). Humor no ponto mais baixo da escala devolve `support`: a tela mostra a
 * orientação de apoio (CVV 188, SAMU 192; §48, CLAUDE.md regra 9), sem avaliação de risco.
 */
export async function saveMoodAction(_prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireAppSession();
  const parsed = moodInputSchema.safeParse({
    loggedAt: form.get('loggedAt'),
    mood: form.get('mood'),
    energy: form.get('energy'),
    stress: form.get('stress'),
    emotions: form.getAll('emotions'),
    note: form.get('note'),
  });
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const t = await getTranslations('forms');
  const support = parsed.data.mood <= LOW_MOOD_SUPPORT_THRESHOLD ? { support: 'true' } : undefined;
  return healthWrite(session, async () => {
    const service = getHealthServices().mood;
    const rawId = form.get('id');
    if (rawId) {
      const id = idSchema.safeParse(rawId);
      const result = id.success ? await service.update(session.userId, id.data, parsed.data) : null;
      if (!result) return { status: 'error', message: t('notFound') };
      if (!result.ok) return { status: 'error', message: t(`errors.${result.error}`) };
      return { status: 'success', message: t('updated'), data: support };
    }
    const result = await service.create(session.userId, parsed.data);
    if (!result.ok) return { status: 'error', message: t(`errors.${result.error}`) };
    return { status: 'success', message: t('saved'), data: support };
  });
}

export async function deleteMoodAction(form: FormData): Promise<void> {
  const session = await requireAppSession();
  const id = idSchema.safeParse(form.get('id'));
  if (!id.success) return;
  await healthMutate(session, () => getHealthServices().mood.remove(session.userId, id.data));
}
