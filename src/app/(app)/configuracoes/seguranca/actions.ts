'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { FormState } from '@/components/forms/form-state';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/modules/auth';
import {
  changePasswordSchema,
  formToObject,
  mfaCodeSchema,
  passwordAndCodeSchema,
  passwordOnlySchema,
  sessionIdSchema,
} from '@/modules/auth/schemas';
import {
  clearKnownDeviceCookie,
  clearSessionCookie,
  getAuthService,
  requireVerifiedSession,
} from '@/modules/auth/server';
import { assertFullApp } from '@/lib/full-app';

/**
 * Segurança da conta (LEG-S04). Toda action revalida a sessão no banco antes de agir. Usa
 * `requireVerifiedSession` (e não `requireAppSession`): proteger a conta (sessões, MFA, senha) nunca fica
 * preso ao onboarding ou ao reconsentimento.
 */
const PATH = '/configuracoes/seguranca';

export async function revokeSessionAction(form: FormData): Promise<void> {
  assertFullApp();
  const session = await requireVerifiedSession();
  const parsed = sessionIdSchema.safeParse(formToObject(form));
  if (!parsed.success) return;
  await getAuthService().revokeSession(session.userId, parsed.data.sessionId);
  if (parsed.data.sessionId === session.sessionId) {
    await clearSessionCookie();
    redirect('/entrar?saiu=1');
  }
  revalidatePath(PATH);
  revalidatePath('/privacidade');
}

export async function revokeOtherSessionsAction(): Promise<void> {
  assertFullApp();
  const session = await requireVerifiedSession();
  await getAuthService().revokeOtherSessions(session.userId, session.sessionId);
  revalidatePath(PATH);
}

export async function startMfaAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  const session = await requireVerifiedSession();
  const t = await getTranslations('auth.errors');
  const parsed = passwordOnlySchema.safeParse(formToObject(form));
  const result = parsed.success
    ? await getAuthService().startTotpSetup(session.userId, parsed.data.password)
    : { ok: false as const };
  // Senha errada, limite atingido ou MFA já ativo: mesma mensagem.
  if (!result.ok) return { status: 'error', fieldErrors: { password: t('invalidPassword') } };
  return {
    status: 'success',
    data: { qrSvg: result.qrSvg, manualKey: result.manualKey },
  };
}

export async function confirmMfaAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  const session = await requireVerifiedSession();
  const t = await getTranslations('auth');
  const parsed = mfaCodeSchema.safeParse(formToObject(form));
  const result = parsed.success
    ? await getAuthService().confirmTotpSetup(session.userId, session.sessionId, parsed.data.code)
    : { ok: false as const, error: 'invalid_code' as const };
  if (!result.ok) {
    // Erros distintos (PR1a-R3-B6): ativação vencida, bloqueio por tentativas ou código inválido.
    const key = {
      setup_expired: 'errors.setupExpired',
      locked: 'errors.mfaSetupLocked',
      invalid_code: 'errors.invalidCode',
    } as const;
    return { status: 'error', fieldErrors: { code: t(key[result.error]) } };
  }
  revalidatePath(PATH);
  return {
    status: 'success',
    message: t('security.mfaEnabled'),
    data: { recoveryCodes: result.recoveryCodes },
  };
}

export async function regenerateCodesAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  const session = await requireVerifiedSession();
  const t = await getTranslations('auth');
  const parsed = passwordOnlySchema.safeParse(formToObject(form));
  const result = parsed.success
    ? await getAuthService().regenerateRecoveryCodes(session.userId, parsed.data.password)
    : { ok: false as const };
  if (!result.ok)
    return { status: 'error', fieldErrors: { password: t('errors.invalidPassword') } };
  revalidatePath(PATH);
  return { status: 'success', data: { recoveryCodes: result.recoveryCodes } };
}

export async function disableMfaAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  const session = await requireVerifiedSession();
  const t = await getTranslations('auth');
  const parsed = passwordAndCodeSchema.safeParse(formToObject(form));
  const ok =
    parsed.success &&
    (await getAuthService().disableMfa(session.userId, parsed.data.password, parsed.data.code));
  // Mensagem única: não diz qual dos dois estava errado.
  if (!ok) return { status: 'error', message: t('errors.invalidCode') };
  revalidatePath(PATH);
  return { status: 'success', message: t('security.mfaDisabled') };
}

export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  const session = await requireVerifiedSession();
  const t = await getTranslations('auth');
  const parsed = changePasswordSchema.safeParse(formToObject(form));
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((i) => i.message === 'mismatch');
    return {
      status: 'error',
      fieldErrors: mismatch
        ? { confirmPassword: t('errors.passwordMismatch') }
        : { currentPassword: t('errors.required') },
    };
  }
  const result = await getAuthService().changePassword(
    session.userId,
    session.sessionId,
    parsed.data.currentPassword,
    parsed.data.password,
  );
  if (!result.ok) {
    return result.error === 'invalid_password'
      ? { status: 'error', fieldErrors: { currentPassword: t('errors.invalidPassword') } }
      : {
          status: 'error',
          fieldErrors: {
            password: t(`errors.${result.error}`, { min: PASSWORD_MIN, max: PASSWORD_MAX }),
          },
        };
  }
  // A senha nova invalida os cookies de aparelho conhecido (B4); este navegador ganha um no próximo login.
  await clearKnownDeviceCookie();
  revalidatePath(PATH);
  return { status: 'success', message: t('security.passwordChanged') };
}
