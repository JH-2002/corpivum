'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import {
  changePasswordAction,
  confirmMfaAction,
  disableMfaAction,
  regenerateCodesAction,
  startMfaAction,
} from '@/app/(app)/configuracoes/seguranca/actions';
import { FormMessage, SubmitButton, TextField } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE, type FormState } from '@/components/forms/form-state';
import { Button } from '@/components/ui/Button';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/modules/auth';

function RecoveryCodes({ codes }: { codes: string[] }) {
  const t = useTranslations('auth.security');
  const download = () => {
    // Gerado no navegador: os códigos não passam por nenhum outro serviço.
    const blob = new Blob([`${codes.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'healthmind360-codigos-de-recuperacao.txt';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border-strong p-4">
      <h3 className="font-semibold">{t('recoveryTitle')}</h3>
      <p className="text-sm">{t('recoveryBody', { count: codes.length })}</p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-base" aria-label={t('recoveryTitle')}>
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Button variant="secondary" onClick={download}>
        {t('recoveryDownload')}
      </Button>
    </section>
  );
}

const codes = (state: FormState) => {
  const value = state.data?.recoveryCodes;
  return Array.isArray(value) ? value : null;
};
const text = (state: FormState, key: string) => {
  const value = state.data?.[key];
  return typeof value === 'string' ? value : '';
};

/** Ativação do TOTP: QR gerado localmente no servidor + chave manual (alternativa acessível). */
export function EnableMfa() {
  const t = useTranslations('auth');
  const [setup, start] = useActionState(startMfaAction, INITIAL_FORM_STATE);
  const [confirm, confirmAction] = useActionState(confirmMfaAction, INITIAL_FORM_STATE);

  const recovery = codes(confirm);
  if (recovery) {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage state={{ status: 'success', message: confirm.message }} />
        <RecoveryCodes codes={recovery} />
      </div>
    );
  }

  if (setup.status !== 'success') {
    return (
      <form action={start} className="flex flex-col gap-3">
        <FormMessage state={setup} />
        <SubmitButton>{t('security.mfaStart')}</SubmitButton>
      </form>
    );
  }

  const svg = text(setup, 'qrSvg');
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">{t('security.mfaScan')}</p>
      <div className="flex flex-wrap items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG local em data: URI, sem otimização */}
        <img
          src={`data:image/svg+xml;base64,${btoa(svg)}`}
          alt={t('security.mfaQrAlt')}
          width={192}
          height={192}
          className="rounded-md border border-border bg-white"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-semibold">{t('security.mfaManualKey')}</p>
          <code className="font-mono text-base break-all">{text(setup, 'manualKey')}</code>
        </div>
      </div>
      <form action={confirmAction} className="flex flex-col gap-3" noValidate>
        <FormMessage state={confirm} />
        <TextField
          name="code"
          label={t('fields.code')}
          error={confirm.fieldErrors?.code}
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          required
        />
        <SubmitButton>{t('security.mfaConfirm')}</SubmitButton>
      </form>
    </div>
  );
}

export function RegenerateCodes() {
  const t = useTranslations('auth');
  const [state, action] = useActionState(regenerateCodesAction, INITIAL_FORM_STATE);
  const recovery = codes(state);
  if (recovery) return <RecoveryCodes codes={recovery} />;
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <TextField
        name="password"
        type="password"
        label={t('fields.currentPassword')}
        hint={t('security.recoveryRegenerateHint')}
        error={state.fieldErrors?.password}
        autoComplete="current-password"
        required
      />
      <SubmitButton variant="secondary">{t('security.recoveryRegenerate')}</SubmitButton>
    </form>
  );
}

export function DisableMfa() {
  const t = useTranslations('auth');
  const [state, action] = useActionState(disableMfaAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <TextField
        name="password"
        type="password"
        label={t('fields.currentPassword')}
        autoComplete="current-password"
        required
      />
      <TextField
        name="code"
        label={t('fields.code')}
        hint={t('fields.codeHint')}
        autoComplete="one-time-code"
        maxLength={16}
        required
      />
      <SubmitButton variant="secondary">{t('security.mfaDisable')}</SubmitButton>
    </form>
  );
}

export function ChangePassword() {
  const t = useTranslations('auth');
  const [state, action] = useActionState(changePasswordAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <TextField
        name="currentPassword"
        type="password"
        label={t('fields.currentPassword')}
        error={state.fieldErrors?.currentPassword}
        autoComplete="current-password"
        required
      />
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
      <SubmitButton>{t('security.passwordSubmit')}</SubmitButton>
    </form>
  );
}
