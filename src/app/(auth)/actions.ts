'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { FormState } from '@/components/forms/form-state';
import { PASSWORD_MAX, PASSWORD_MIN, type PasswordProblem } from '@/modules/auth';
import {
  birthDateSchema,
  emailOnlySchema,
  formToObject,
  loginSchema,
  mfaCodeSchema,
  resetSchema,
  signupSchema,
  tokenSchema,
} from '@/modules/auth/schemas';
import {
  clearAgeOkCookie,
  clearKnownDeviceCookie,
  clearSessionCookie,
  getAuthService,
  hasAgeBlockCookie,
  readAgeOkCookie,
  readSessionToken,
  requestMeta,
  setAgeBlockCookie,
  setAgeOkCookie,
  setKnownDeviceCookie,
  setSessionCookie,
} from '@/modules/auth/server';
import { assertFullApp } from '@/lib/full-app';

/**
 * Server actions públicas de auth (LEG-S04, LEG-F01). O Next verifica a origem de toda server action
 * (CSRF, LEG-S05); toda entrada passa por Zod. Mensagens não revelam se o e-mail existe (ADR-0014).
 */

async function passwordMessage(problem: PasswordProblem): Promise<string> {
  const t = await getTranslations('auth.errors');
  return t(problem, { min: PASSWORD_MIN, max: PASSWORD_MAX });
}

/** Passo 1 do cadastro. Menor: só um cookie sem identificador; nada vai para banco ou log (LEG-F01). */
export async function checkAgeAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  // O bloqueio vale também para POST direto à action, não só para a página.
  if (await hasAgeBlockCookie()) redirect('/cadastro/indisponivel');
  const t = await getTranslations('auth.errors');
  const parsed = birthDateSchema.safeParse(formToObject(form));
  if (!parsed.success) {
    return { status: 'error', fieldErrors: { birthDate: t('birthDateInvalid') } };
  }
  const result = await getAuthService().checkAge(parsed.data.birthDate, await headers());
  if (result.outcome === 'invalid') {
    return { status: 'error', fieldErrors: { birthDate: t('birthDateInvalid') } };
  }
  if (result.outcome === 'minor') {
    await setAgeBlockCookie();
    redirect('/cadastro/indisponivel');
  }
  await setAgeOkCookie(result.cookie);
  redirect('/cadastro/conta');
}

export async function signupAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  if (await hasAgeBlockCookie()) redirect('/cadastro/indisponivel');
  const t = await getTranslations('auth.errors');
  const parsed = signupSchema.safeParse(formToObject(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      fieldErrors[key] ??=
        key === 'email'
          ? t('emailInvalid')
          : issue.message === 'mismatch'
            ? t('passwordMismatch')
            : t('required');
    }
    return { status: 'error', fieldErrors };
  }
  const result = await getAuthService().register(
    { ...parsed.data, ageOkCookie: await readAgeOkCookie() },
    await requestMeta(),
  );
  if (!result.ok) {
    if (result.error === 'weak_password') {
      return { status: 'error', fieldErrors: { password: await passwordMessage(result.problem) } };
    }
    if (result.error === 'rate_limited') return { status: 'error', message: t('rateLimited') };
    redirect('/cadastro');
  }
  await clearAgeOkCookie();
  redirect('/cadastro/confira-o-email');
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  const t = await getTranslations('auth.errors');
  const parsed = loginSchema.safeParse(formToObject(form));
  if (!parsed.success) return { status: 'error', message: t('invalidCredentials') };
  const result = await getAuthService().login(parsed.data, await requestMeta());
  if (!result.ok) return { status: 'error', message: t('invalidCredentials') };
  await setSessionCookie(result.token, result.mfaRequired);
  if (result.mfaRequired) redirect('/entrar/verificacao');
  await setKnownDeviceCookie(result.knownDevice);
  redirect('/inicio');
}

export async function verifyMfaAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  const t = await getTranslations('auth.errors');
  const parsed = mfaCodeSchema.safeParse(formToObject(form));
  if (!parsed.success) return { status: 'error', fieldErrors: { code: t('invalidCode') } };
  const result = await getAuthService().verifyMfa(
    await readSessionToken(),
    parsed.data.code,
    await requestMeta(),
  );
  if (!result.ok) {
    if (result.error === 'invalid_code') {
      return { status: 'error', fieldErrors: { code: t('invalidCode') } };
    }
    await clearSessionCookie();
    return {
      status: 'error',
      message: result.error === 'locked' ? t('mfaLocked') : t('noPendingSession'),
    };
  }
  await setSessionCookie(result.token, false);
  await setKnownDeviceCookie(result.knownDevice);
  redirect('/inicio');
}

export async function verifyEmailAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  const t = await getTranslations('auth');
  const parsed = tokenSchema.safeParse(formToObject(form));
  const ok = parsed.success && (await getAuthService().verifyEmail(parsed.data.token));
  return ok
    ? { status: 'success', message: t('verify.done') }
    : { status: 'error', message: t('errors.invalidToken') };
}

export async function resendVerificationAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  assertFullApp();
  const t = await getTranslations('auth');
  const parsed = emailOnlySchema.safeParse(formToObject(form));
  if (!parsed.success) return { status: 'error', fieldErrors: { email: t('errors.emailInvalid') } };
  await getAuthService().resendVerification(parsed.data.email, await requestMeta());
  // Sempre a mesma resposta (ADR-0014).
  return { status: 'success', message: t('verify.resent') };
}

export async function forgotPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  const t = await getTranslations('auth');
  const parsed = emailOnlySchema.safeParse(formToObject(form));
  if (!parsed.success) return { status: 'error', fieldErrors: { email: t('errors.emailInvalid') } };
  await getAuthService().requestPasswordReset(parsed.data.email, await requestMeta());
  // Sempre a mesma resposta (ADR-0014).
  return { status: 'success', message: t('forgot.sent') };
}

export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  assertFullApp();
  const t = await getTranslations('auth.errors');
  const parsed = resetSchema.safeParse(formToObject(form));
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((i) => i.message === 'mismatch');
    if (mismatch)
      return { status: 'error', fieldErrors: { confirmPassword: t('passwordMismatch') } };
    return { status: 'error', message: t('invalidToken') };
  }
  const result = await getAuthService().resetPassword(parsed.data.token, parsed.data.password);
  if (!result.ok) {
    if (result.error === 'invalid_token') return { status: 'error', message: t('invalidToken') };
    return { status: 'error', fieldErrors: { password: await passwordMessage(result.problem) } };
  }
  await clearSessionCookie();
  // A senha nova já invalida os cookies de aparelho antigos (B4); este navegador também recomeça.
  await clearKnownDeviceCookie();
  redirect('/entrar?redefinida=1');
}

export async function logoutAction(): Promise<void> {
  assertFullApp();
  await getAuthService().logout(await readSessionToken());
  await clearSessionCookie();
  redirect('/entrar?saiu=1');
}
