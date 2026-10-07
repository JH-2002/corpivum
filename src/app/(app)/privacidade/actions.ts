'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { FormState } from '@/components/forms/form-state';
import {
  clearKnownDeviceCookie,
  clearSessionCookie,
  setAgeBlockCookie,
} from '@/modules/auth/server';
import { AVAILABLE_PURPOSES } from '@/modules/consent';
import { getConsentService, requireAppSession } from '@/modules/consent/server';
import { getPrivacyService } from '@/modules/privacy/server';

/**
 * Central de Privacidade (LEG-C04, LEG-F04). Toda action revalida a sessão no banco. A Central fica
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

const passwordSchema = z.object({ password: z.string().min(1).max(512) });

/** Encerramento de conta de quem se descobre menor (LEG-F04): senha atual + apagamento imediato. */
export async function closeMinorAccountAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireAppSession({ allowPendingUpdate: true });
  const t = await getTranslations('privacyCenter');
  const parsed = passwordSchema.safeParse({ password: form.get('password') });
  const result = parsed.success
    ? await getPrivacyService().closeMinorAccount(session.userId, parsed.data.password)
    : 'invalid_password';
  if (result === 'unavailable') return { status: 'error', message: t('minorUnavailable') };
  if (result !== 'closed') return { status: 'error', fieldErrors: { password: t('minorError') } };
  await clearSessionCookie();
  await clearKnownDeviceCookie();
  // Desencoraja novo cadastro imediato, sem identificar ninguém (LEG-F01).
  await setAgeBlockCookie();
  redirect('/conta-encerrada');
}
