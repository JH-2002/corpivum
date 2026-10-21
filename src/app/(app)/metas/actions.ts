'use server';

import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { FormState } from '@/components/forms/form-state';
import { requireAppSession } from '@/modules/consent/server';
import { goalInputSchema } from '@/modules/goals';
import type { GoalWriteResult } from '@/modules/goals/service';
import { fieldErrorsOf, healthMutate, healthWrite } from '@/modules/health/form-result';
import { getHealthServices } from '@/modules/health/server';
import { idSchema } from '@/modules/health/zod';
import { assertFullApp } from '@/lib/full-app';

/**
 * Metas (§30, LEG-M04, LEG-M06, LEG-M07): criar/editar, arquivar e excluir. O serviço reaplica `checkGoal`
 * com os dados do banco. Bloqueada = nada é gravado e a tela mostra `GuardrailNotice` (motivos, sem
 * números e sem alvo alternativo).
 */
export async function saveGoalAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  const session = await requireAppSession();
  const parsed = goalInputSchema.safeParse({
    metric: form.get('metric'),
    targetValue: form.get('targetValue'),
    habitId: form.get('habitId'),
    targetDay: form.get('targetDay'),
  });
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const t = await getTranslations('forms');
  return healthWrite(session, async () => {
    const service = getHealthServices().goals;
    const rawId = form.get('id');
    let result: GoalWriteResult | null;
    if (rawId) {
      const id = idSchema.safeParse(rawId);
      result = id.success ? await service.update(session.userId, id.data, parsed.data) : null;
    } else {
      result = await service.create(session.userId, parsed.data);
    }
    if (!result) return { status: 'error', message: t('notFound') };
    if (!result.ok) {
      if ('reasons' in result) return { status: 'error', data: { reasons: result.reasons } };
      return { status: 'error', message: t(`errors.${result.error}`) };
    }
    return { status: 'success', message: rawId ? t('updated') : t('saved') };
  });
}

const archiveSchema = z.object({
  id: idSchema,
  archived: z.enum(['true', 'false']).transform((v) => v === 'true'),
});

export async function archiveGoalAction(form: FormData): Promise<void> {
  assertFullApp();
  const session = await requireAppSession();
  const parsed = archiveSchema.safeParse({ id: form.get('id'), archived: form.get('archived') });
  if (!parsed.success) return;
  await healthMutate(session, () =>
    getHealthServices().goals.setArchived(session.userId, parsed.data.id, parsed.data.archived),
  );
}

export async function deleteGoalAction(form: FormData): Promise<void> {
  assertFullApp();
  const session = await requireAppSession();
  const id = idSchema.safeParse(form.get('id'));
  if (!id.success) return;
  await healthMutate(session, () => getHealthServices().goals.remove(session.userId, id.data));
}
