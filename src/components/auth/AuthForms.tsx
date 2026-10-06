'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  checkAgeAction,
  forgotPasswordAction,
  loginAction,
  resendVerificationAction,
  resetPasswordAction,
  signupAction,
  verifyEmailAction,
  verifyMfaAction,
} from '@/app/(auth)/actions';
import { FormMessage, SubmitButton, TextField } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE } from '@/components/forms/form-state';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/modules/auth';

const linkClass = 'font-semibold text-primary underline underline-offset-2';

export function LoginForm({ notice }: { notice?: string }) {
  const t = useTranslations('auth');
  const [state, action] = useActionState(loginAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {notice && state.status === 'idle' ? (
        <p role="status" className="rounded-md bg-surface-muted p-3 text-sm">
          {notice}
        </p>
      ) : null}
      <FormMessage state={state} />
      <TextField
        name="email"
        type="email"
        label={t('fields.email')}
        autoComplete="email"
        required
      />
      <TextField
        name="password"
        type="password"
        label={t('fields.password')}
        autoComplete="current-password"
        required
      />
      <SubmitButton>{t('login.submit')}</SubmitButton>
      <p className="text-sm">
        <Link href="/recuperar-senha" className={linkClass}>
          {t('login.forgot')}
        </Link>
      </p>
      <p className="text-sm">
        {t('login.noAccount')}{' '}
        <Link href="/cadastro" className={linkClass}>
          {t('login.createAccount')}
        </Link>
      </p>
    </form>
  );
}

export function MfaForm() {
  const t = useTranslations('auth');
  const [state, action] = useActionState(verifyMfaAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField
        name="code"
        label={t('fields.code')}
        hint={t('fields.codeHint')}
        error={state.fieldErrors?.code}
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={16}
        required
      />
      <SubmitButton>{t('mfa.submit')}</SubmitButton>
      <p className="text-sm">
        <Link href="/entrar" className={linkClass}>
          {t('mfa.back')}
        </Link>
      </p>
    </form>
  );
}

export function AgeForm() {
  const t = useTranslations('auth');
  const [state, action] = useActionState(checkAgeAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField
        name="birthDate"
        type="date"
        label={t('fields.birthDate')}
        hint={t('fields.birthDateHint')}
        error={state.fieldErrors?.birthDate}
        autoComplete="bday"
        required
      />
      <SubmitButton>{t('signup.continue')}</SubmitButton>
      <p className="text-sm">
        {t('signup.haveAccount')}{' '}
        <Link href="/entrar" className={linkClass}>
          {t('signup.signIn')}
        </Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const t = useTranslations('auth');
  const [state, action] = useActionState(signupAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField
        name="email"
        type="email"
        label={t('fields.email')}
        error={state.fieldErrors?.email}
        autoComplete="email"
        required
      />
      <TextField
        name="password"
        type="password"
        label={t('fields.password')}
        hint={t('fields.passwordHint', { min: PASSWORD_MIN, max: PASSWORD_MAX })}
        error={state.fieldErrors?.password}
        autoComplete="new-password"
        maxLength={PASSWORD_MAX}
        required
      />
      <TextField
        name="confirmPassword"
        type="password"
        label={t('fields.confirmPassword')}
        error={state.fieldErrors?.confirmPassword}
        autoComplete="new-password"
        required
      />
      <SubmitButton>{t('signup.submit')}</SubmitButton>
    </form>
  );
}

export function VerifyEmailForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const [state, action] = useActionState(verifyEmailAction, INITIAL_FORM_STATE);
  if (state.status === 'success') {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <Link href="/entrar" className={linkClass}>
          {t('login.title')}
        </Link>
      </div>
    );
  }
  // Confirmação por POST: scanners de link em e-mail não consomem o token só por abrir a página.
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <p className="text-sm">{t('verify.confirmBody')}</p>
      <input type="hidden" name="token" value={token} />
      <SubmitButton>{t('verify.confirm')}</SubmitButton>
    </form>
  );
}

export function ResendVerificationForm() {
  const t = useTranslations('auth');
  const [state, action] = useActionState(resendVerificationAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField
        name="email"
        type="email"
        label={t('fields.email')}
        error={state.fieldErrors?.email}
        autoComplete="email"
        required
      />
      <SubmitButton variant="secondary">{t('verify.resend')}</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const [state, action] = useActionState(forgotPasswordAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <TextField
        name="email"
        type="email"
        label={t('fields.email')}
        error={state.fieldErrors?.email}
        autoComplete="email"
        required
      />
      <SubmitButton>{t('forgot.submit')}</SubmitButton>
      <p className="text-sm">
        <Link href="/entrar" className={linkClass}>
          {t('forgot.back')}
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const [state, action] = useActionState(resetPasswordAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <TextField
        name="password"
        type="password"
        label={t('fields.newPassword')}
        hint={t('fields.passwordHint', { min: PASSWORD_MIN, max: PASSWORD_MAX })}
        error={state.fieldErrors?.password}
        autoComplete="new-password"
        maxLength={PASSWORD_MAX}
        required
      />
      <TextField
        name="confirmPassword"
        type="password"
        label={t('fields.confirmPassword')}
        error={state.fieldErrors?.confirmPassword}
        autoComplete="new-password"
        required
      />
      <SubmitButton>{t('reset.submit')}</SubmitButton>
    </form>
  );
}
