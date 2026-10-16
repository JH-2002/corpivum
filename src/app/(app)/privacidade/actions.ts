'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { getFormatter, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { FormState } from '@/components/forms/form-state';
import { AVAILABLE_PURPOSES } from '@/modules/consent';
import { getConsentService, requireAppSession } from '@/modules/consent/server';
import { runAccountDeletion, runMinorClosure } from '@/modules/privacy/account-exit';
import { getPrivacyService } from '@/modules/privacy/server';
import { OPENABLE_REQUEST_KINDS } from '@/modules/privacy/requests';
import { processExportsSoon } from '@/modules/reports/server';

/**
 * Central de Privacidade (LEG-C04, LEG-D04, LEG-D07, LEG-F04). Toda action revalida a sessão no banco. A Central fica
 * acessível mesmo com reconsentimento pendente: revogar nunca depende de aceitar algo antes.
 */
const purposeSchema = z.object({ purpose: z.enum(AVAILABLE_PURPOSES) });

export async function grantConsentAction(form: FormData): Promise<void> {
  const session = await requireAppSession({ allowPendingUpdate: true });
  const parsed = purposeSchema.safeParse({ purpose: form.get('purpose') });
  if (!parsed.success) return;
  await getConsentService().grant(session.userId, parsed.data.purpose);
  // O estado de consentimento muda o que os módulos podem exibir.
  revalidatePath('/', 'layout');
}

/** Revogar vale na próxima operação (LEG-C04). Dados de bem-estar: eliminação agendada (ADR-0019). */
export async function revokeConsentAction(form: FormData): Promise<void> {
  const session = await requireAppSession({ allowPendingUpdate: true });
  const parsed = purposeSchema.safeParse({ purpose: form.get('purpose') });
  if (!parsed.success) return;
  await getConsentService().revoke(session.userId, parsed.data.purpose);
  revalidatePath('/', 'layout');
}

/** Encerramento de conta de quem se descobre menor (LEG-F04): senha atual + apagamento imediato. */
export async function closeMinorAccountAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireAppSession({ allowPendingUpdate: true });
  const failed = await runMinorClosure(session.userId, form);
  if (failed) return failed;
  redirect('/conta-encerrada');
}

const requestSchema = z.object({ kind: z.enum(OPENABLE_REQUEST_KINDS) });

/**
 * Pedido do titular (LEG-D07): confirmação imediata na tela com protocolo, tipo, data e prazo (o recibo vai por
 * e-mail). Confirmação e compartilhamento já saem atendidos; portabilidade pede a cópia completa.
 */
export async function openPrivacyRequestAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireAppSession({ allowPendingUpdate: true });
  const t = await getTranslations('privacyCenter.requests');
  const parsed = requestSchema.safeParse({ kind: form.get('kind') });
  if (!parsed.success) return { status: 'error', message: t('error') };
  const result = await getPrivacyService().openRequest(session.userId, parsed.data.kind);
  if (result.status === 'rate_limited') return { status: 'error', message: t('rateLimited') };
  if (parsed.data.kind === 'portability') after(processExportsSoon);
  revalidatePath('/privacidade');
  const format = await getFormatter();
  const date = (d: Date) => format.dateTime(d, { dateStyle: 'long' });
  const { request } = result;
  return {
    status: 'success',
    message: t(result.created ? 'created' : 'existing'),
    data: {
      protocol: request.id,
      kind: request.kind,
      requestStatus: request.status,
      openedAt: date(request.createdAt),
      dueAt: date(request.dueAt),
    },
  };
}

/**
 * Exclusão de conta (LEG-D04, purga imediata): oferta de baixar os dados antes (ou "não quero baixar"),
 * reautenticação (senha e, com MFA, o 2º fator) e a frase exata, conferida no servidor.
 */
export async function deleteAccountAction(_prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireAppSession({ allowPendingUpdate: true });
  const failed = await runAccountDeletion(session.userId, form, { offerExport: true });
  if (failed) return failed;
  // A purga roda na fila; em dev/test, logo depois da resposta.
  after(processExportsSoon);
  redirect('/conta-excluida');
}
