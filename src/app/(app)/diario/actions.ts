'use server';

import { getTranslations } from 'next-intl/server';
import type { FormState } from '@/components/forms/form-state';
import { requireAppSession } from '@/modules/consent/server';
import { fieldErrorsOf, healthDelete, healthWrite } from '@/modules/health/form-result';
import { getHealthServices } from '@/modules/health/server';
import { idSchema } from '@/modules/health/zod';
import { journalInputSchema } from '@/modules/journal';

/**
 * Diário (§19). O conteúdo é cifrado antes de ir ao banco (LEG-S02) e nunca aparece em log ou erro.
 * A IA não lê o diário (Fase 5: só trechos escolhidos, com consentimento de IA).
 */
export async function saveJournalAction(_prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireAppSession();
  const parsed = journalInputSchema.safeParse({
    day: form.get('day'),
    content: form.get('content'),
    mood: form.get('mood'),
    tags: form.getAll('tags'),
  });
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const t = await getTranslations('forms');
  return healthWrite(session, async () => {
    const service = getHealthServices().journal;
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

export async function deleteJournalAction(form: FormData): Promise<void> {
  const session = await requireAppSession();
  const id = idSchema.safeParse(form.get('id'));
  if (!id.success) return;
  await healthDelete(session, () => getHealthServices().journal.remove(session.userId, id.data));
}
