'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { getFormatter, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { FormState } from '@/components/forms/form-state';
import {
  clearKnownDeviceCookie,
  clearSessionCookie,
  setAgeBlockCookie,
} from '@/modules/auth/server';
import { AVAILABLE_PURPOSES } from '@/modules/consent';
import { getConsentService, requireAppSession } from '@/modules/consent/server';
import { isDeletionPhrase } from '@/modules/privacy/deletion';
import { getPrivacyService } from '@/modules/privacy/server';
import { OPENABLE_REQUEST_KINDS } from '@/modules/privacy/requests';
import { getReportsService, processExportsSoon } from '@/modules/reports/server';

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

const passwordSchema = z.object({
  password: z.string().min(1).max(512),
  mfaCode: z.string().trim().max(64).optional(),
});

/** Encerramento de conta de quem se descobre menor (LEG-F04): senha atual + apagamento imediato. */
export async function closeMinorAccountAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireAppSession({ allowPendingUpdate: true });
  const t = await getTranslations('privacyCenter');
  const parsed = passwordSchema.safeParse({
    password: form.get('password'),
    mfaCode: form.get('mfaCode') || undefined,
  });
  const result = parsed.success
    ? await getPrivacyService().closeMinorAccount(
        session.userId,
        parsed.data.password,
        parsed.data.mfaCode,
      )
    : 'invalid_password';
  if (result === 'unavailable') return { status: 'error', message: t('minorUnavailable') };
  if (result !== 'closed') return { status: 'error', fieldErrors: { password: t('minorError') } };
  await clearSessionCookie();
  await clearKnownDeviceCookie();
  // Desencoraja novo cadastro imediato, sem identificar ninguém (LEG-F01).
  await setAgeBlockCookie();
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

const deletionSchema = z.object({
  password: z.string().min(1).max(512),
  mfaCode: z.string().trim().max(64).optional(),
  phrase: z.string().max(200).refine(isDeletionPhrase),
  skipExport: z.literal('on').optional(),
});

/**
 * Exclusão de conta (LEG-D04, purga imediata): oferta de baixar os dados antes (ou "não quero baixar"),
 * reautenticação (senha e, com MFA, o 2º fator) e a frase exata, conferida aqui no servidor.
 */
export async function deleteAccountAction(_prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireAppSession({ allowPendingUpdate: true });
  const t = await getTranslations('privacyCenter.deletion');
  const raw = {
    password: form.get('password') ?? '',
    mfaCode: form.get('mfaCode') || undefined,
    phrase: form.get('phrase') ?? '',
    skipExport: form.get('skipExport') || undefined,
  };
  const parsed = deletionSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = new Set(parsed.error.issues.map((i) => String(i.path[0])));
    return {
      status: 'error',
      fieldErrors: {
        ...(fields.has('phrase') ? { phrase: t('phraseError') } : {}),
        ...(fields.has('password') ? { password: t('credentialsError') } : {}),
      },
    };
  }
  if (!parsed.data.skipExport) {
    const files = await getReportsService().list(session.userId);
    if (!files.some((f) => f.kind === 'full_export' && f.downloadable)) {
      return { status: 'error', fieldErrors: { skipExport: t('exportChoiceError') } };
    }
  }
  const result = await getPrivacyService().deleteAccount(session.userId, {
    password: parsed.data.password,
    ...(parsed.data.mfaCode ? { mfaCode: parsed.data.mfaCode } : {}),
  });
  if (result !== 'deleted') {
    return { status: 'error', fieldErrors: { password: t('credentialsError') } };
  }
  // A purga roda na fila; em dev/test, logo depois da resposta.
  after(processExportsSoon);
  await clearSessionCookie();
  await clearKnownDeviceCookie();
  redirect('/conta-excluida');
}
