'use server';

import { getTranslations } from 'next-intl/server';
import type { FormState } from '@/components/forms/form-state';
import { BODY_FIELDS, bodyInputSchema } from '@/modules/body';
import { requireAppSession } from '@/modules/consent/server';
import { fieldErrorsOf, healthDelete, healthWrite } from '@/modules/health/form-result';
import { getHealthServices } from '@/modules/health/server';
import { idSchema } from '@/modules/health/zod';

/** Peso e medidas (§23). Valores informados; IMC só é calculado na leitura (ESTIMADO). */
export async function saveBodyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireAppSession();
  const raw: Record<string, FormDataEntryValue | null> = { measuredAt: form.get('measuredAt') };
  for (const field of BODY_FIELDS) raw[field] = form.get(field);
  const parsed = bodyInputSchema.safeParse(raw);
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const t = await getTranslations('forms');
  return healthWrite(session, async () => {
    const service = getHealthServices().body;
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

export async function deleteBodyAction(form: FormData): Promise<void> {
  const session = await requireAppSession();
  const id = idSchema.safeParse(form.get('id'));
  if (!id.success) return;
  await healthDelete(session, () => getHealthServices().body.remove(session.userId, id.data));
}
