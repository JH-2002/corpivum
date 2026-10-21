'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { FormState } from '@/components/forms/form-state';
import { requireAppSession } from '@/modules/consent/server';
import { fieldErrorsOf, healthMutate, healthWrite } from '@/modules/health/form-result';
import { getHealthServices, setCalorieEstimateEnabled } from '@/modules/health/server';
import { idSchema } from '@/modules/health/zod';
import { calorieEstimateSchema, mealInputSchema, waterInputSchema } from '@/modules/nutrition';
import { assertFullApp } from '@/lib/full-app';

/**
 * Alimentação (§25, LEG-M07, LEG-M08): refeições, água e a preferência da estimativa calórica. Sessão +
 * onboarding, Zod, consentimento (serviço + RLS). A caloria só é aceita com a estimativa ligada.
 */
export async function saveMealAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  const session = await requireAppSession();
  const parsed = mealInputSchema.safeParse({
    eatenAt: form.get('eatenAt'),
    category: form.get('category'),
    description: form.get('description'),
    hunger: form.get('hunger'),
    fullness: form.get('fullness'),
    satisfaction: form.get('satisfaction'),
    kcalEstimate: form.get('kcalEstimate'),
    note: form.get('note'),
  });
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const t = await getTranslations('forms');
  return healthWrite(session, async () => {
    const service = getHealthServices().nutrition;
    const rawId = form.get('id');
    if (rawId) {
      const id = idSchema.safeParse(rawId);
      const result = id.success
        ? await service.updateMeal(session.userId, id.data, parsed.data)
        : null;
      if (!result) return { status: 'error', message: t('notFound') };
      if (!result.ok) return { status: 'error', message: t(`errors.${result.error}`) };
      return { status: 'success', message: t('updated') };
    }
    const result = await service.createMeal(session.userId, parsed.data);
    if (!result.ok) return { status: 'error', message: t(`errors.${result.error}`) };
    return { status: 'success', message: t('saved') };
  });
}

export async function deleteMealAction(form: FormData): Promise<void> {
  assertFullApp();
  const session = await requireAppSession();
  const id = idSchema.safeParse(form.get('id'));
  if (!id.success) return;
  await healthMutate(session, () =>
    getHealthServices().nutrition.removeMeal(session.userId, id.data),
  );
}

/** Água em um toque (quantidade rápida) ou com outra quantidade. Valor inválido é ignorado. */
export async function addWaterAction(form: FormData): Promise<void> {
  assertFullApp();
  const session = await requireAppSession();
  const parsed = waterInputSchema.safeParse({ day: form.get('day'), ml: form.get('ml') });
  if (!parsed.success) return;
  await healthMutate(session, () =>
    getHealthServices().nutrition.addWater(session.userId, parsed.data),
  );
}

export async function removeWaterAction(form: FormData): Promise<void> {
  assertFullApp();
  const session = await requireAppSession();
  const id = idSchema.safeParse(form.get('id'));
  if (!id.success) return;
  await healthMutate(session, () =>
    getHealthServices().nutrition.removeWater(session.userId, id.data),
  );
}

/** Liga ou desliga a estimativa calórica (padrão desligada, LEG-M07). Só com dados próprios. */
export async function setCalorieEstimateAction(form: FormData): Promise<void> {
  assertFullApp();
  const session = await requireAppSession();
  if (session.dataMode !== 'own') return;
  const parsed = calorieEstimateSchema.safeParse({ enabled: form.get('enabled') });
  if (!parsed.success) return;
  await setCalorieEstimateEnabled(session.userId, parsed.data.enabled);
  revalidatePath('/', 'layout');
}
