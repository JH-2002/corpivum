'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { FormState } from '@/components/forms/form-state';
import { readPeriod } from '@/lib/period-server';
import { getConsentService, requireAppSession } from '@/modules/consent/server';
import { SCORE_VERSION } from '@/modules/wellbeing';
import { requestScoreReview } from '@/modules/wellbeing/server';

const reviewSchema = z.object({ version: z.coerce.number().int().min(1).max(SCORE_VERSION) });

/**
 * "Pedir revisão" do Índice de Bem-Estar (LEG-D08). O período é o selecionado (cookie revalidado no
 * servidor), nunca um valor vindo do formulário. Só com dados próprios: no demo não há decisão sobre a
 * pessoa.
 */
export async function requestScoreReviewAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireAppSession();
  const t = await getTranslations('wellbeing.review');
  if (session.dataMode !== 'own') return { status: 'error', message: t('demo') };
  const parsed = reviewSchema.safeParse({ version: form.get('version') });
  if (!parsed.success) return { status: 'error', message: t('error') };
  const { range } = await readPeriod();
  const { dueAt } = await requestScoreReview(session.userId, parsed.data.version, range);
  const format = await getFormatter();
  revalidatePath('/privacidade');
  return {
    status: 'success',
    message: t('done', { date: format.dateTime(dueAt, { dateStyle: 'long' }) }),
  };
}

/**
 * Sai do modo demonstração (§52.5, ADR-0021): a partir daqui o app mostra só os registros da pessoa.
 * Nada fictício foi gravado, então não há o que apagar.
 */
export async function switchToOwnDataAction(): Promise<void> {
  const session = await requireAppSession();
  await getConsentService().chooseDataMode(session.userId, 'own');
  revalidatePath('/', 'layout');
  redirect('/inicio');
}
