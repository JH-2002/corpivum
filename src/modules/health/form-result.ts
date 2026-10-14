import 'server-only';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { z } from 'zod';
import type { FormState } from '@/components/forms/form-state';
import { ConsentRequiredError } from '@/lib/errors';
import type { AppSession } from '@/modules/consent/server';

/**
 * Apoio às server actions de registro (Fase 2). Mensagens já traduzidas; nunca ecoam o conteúdo enviado
 * (LEG-R04). No modo demo nada é gravado (ADR-0021).
 */
export async function fieldErrorsOf(error: z.ZodError): Promise<FormState> {
  const t = await getTranslations('forms');
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    const known = [
      'wake_before_bed',
      'weekdays_required',
      'times_required',
      'at_least_one',
      'habit_required',
      'quiet_both',
    ];
    fieldErrors[field] ??= known.includes(issue.message)
      ? t(`errors.${issue.message as 'wake_before_bed'}`)
      : t('errors.field');
  }
  return { status: 'error', message: t('invalid'), fieldErrors };
}

/** Executa a gravação com as checagens comuns e devolve o estado do formulário. */
export async function healthWrite(
  session: AppSession,
  write: () => Promise<FormState>,
): Promise<FormState> {
  const t = await getTranslations('forms');
  if (session.dataMode !== 'own') return { status: 'error', message: t('demoReadOnly') };
  try {
    const result = await write();
    if (result.status === 'success') revalidatePath('/', 'layout');
    return result;
  } catch (error) {
    if (error instanceof ConsentRequiredError) return { status: 'error', message: t('consent') };
    throw error;
  }
}

/**
 * Alteração sem formulário (excluir, arquivar, marcar check): só com dados próprios. Sem consentimento,
 * não faz nada e não lança: o erro não chega à página de erro nem aos logs da plataforma, que ligariam a
 * requisição à revogação (revisão da Fase 2, M2). A tela recarregada mostra o aviso de consentimento.
 */
export async function healthMutate(
  session: AppSession,
  mutate: () => Promise<unknown>,
): Promise<void> {
  if (session.dataMode !== 'own') return;
  try {
    await mutate();
  } catch (error) {
    if (!(error instanceof ConsentRequiredError)) throw error;
  }
  // Também sem consentimento: a tela recarregada mostra o aviso de autorização.
  revalidatePath('/', 'layout');
}
