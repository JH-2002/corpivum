'use server';

import { getTranslations } from 'next-intl/server';
import type { FormState } from '@/components/forms/form-state';
import { requireAppSession } from '@/modules/consent/server';
import { fieldErrorsOf, healthDelete, healthWrite } from '@/modules/health/form-result';
import { getHealthServices } from '@/modules/health/server';
import { idSchema } from '@/modules/health/zod';
import { sleepInputSchema } from '@/modules/sleep';

/** Sono (§20): criar/editar e excluir. Sessão + onboarding, Zod, consentimento (serviço + RLS). */
export async function saveSleepAction(_prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireAppSession();
  const parsed = sleepInputSchema.safeParse({
    bedAt: form.get('bedAt'),
    wakeAt: form.get('wakeAt'),
    quality: form.get('quality'),
    awakenings: form.get('awakenings'),
    note: form.get('note'),
  });
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const t = await getTranslations('forms');
  return healthWrite(session, async () => {
    const service = getHealthServices().sleep;
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

export async function deleteSleepAction(form: FormData): Promise<void> {
  const session = await requireAppSession();
  const id = idSchema.safeParse(form.get('id'));
  if (!id.success) return;
  await healthDelete(session, () => getHealthServices().sleep.remove(session.userId, id.data));
}
