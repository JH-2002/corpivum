'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { closeMinorAccountAction, revokeConsentAction } from '@/app/(app)/privacidade/actions';
import { closeMinorAccountFromOnboardingAction } from '@/app/(onboarding)/actions';
import { FormMessage, SubmitButton, TextField } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE } from '@/components/forms/form-state';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/**
 * Revogação dos dados de bem-estar (ADR-0019): aviso claro antes do 2º clique. O que para na hora, a data
 * da eliminação, como cancelar e a oferta de exportar antes (exportação completa em "Seus dados", ADR-0032).
 */
export function HealthRevokeDialog({
  purgeDate,
  graceDays,
}: {
  /** Data da eliminação, já formatada no servidor. */
  purgeDate: string;
  graceDays: number;
}) {
  const t = useTranslations('consent');
  const title = t('purposes.health_data.title');
  return (
    <ConfirmDialog
      triggerLabel={t('revoke')}
      triggerAriaLabel={t('revokeLabel', { purpose: title })}
      title={t('healthRevoke.title')}
    >
      {(close) => (
        <>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
            <li>{t('healthRevoke.stopNow')}</li>
            <li>{t('healthRevoke.elimination', { date: purgeDate, days: graceDays })}</li>
            <li>{t('healthRevoke.cancel')}</li>
          </ul>
          <p className="rounded-md bg-surface-muted p-3 text-sm">
            {t('healthRevoke.exportFirst')}{' '}
            <a href="#seus-dados" onClick={close} className="font-semibold text-primary underline">
              {t('healthRevoke.exportLink')}
            </a>
          </p>
          <form action={revokeConsentAction} className="flex flex-wrap gap-3">
            <input type="hidden" name="purpose" value="health_data" />
            <SubmitButton variant="primary">{t('healthRevoke.confirm')}</SubmitButton>
            <Button variant="secondary" onClick={close}>
              {t('healthRevoke.keep')}
            </Button>
          </form>
        </>
      )}
    </ConfirmDialog>
  );
}

/** Prazos do que fica guardado após o encerramento (texto exato, revisão M2). */
export interface RetentionDays {
  proofDays: number;
  accessDays: number;
  backupDays: number;
}

/** Encerramento para quem se descobre menor (LEG-F04): confirmação reforçada com a senha. */
export function MinorClosureDialog({
  retention,
  mfaEnabled,
  fromOnboarding = false,
}: {
  retention: RetentionDays;
  /** Com MFA ligado, o encerramento também pede o 2º fator (revisão M1 da 6b). */
  mfaEnabled: boolean;
  /** Tela mínima do onboarding (P7-M2): action que exige só o e-mail confirmado. */
  fromOnboarding?: boolean;
}) {
  const t = useTranslations('privacyCenter');
  const ta = useTranslations('auth.fields');
  return (
    <ConfirmDialog triggerLabel={t('minorStart')} title={t('minorConfirmTitle')}>
      {(close) => (
        <MinorClosureForm
          onCancel={close}
          passwordLabel={ta('currentPassword')}
          retention={retention}
          mfaEnabled={mfaEnabled}
          fromOnboarding={fromOnboarding}
        />
      )}
    </ConfirmDialog>
  );
}

function MinorClosureForm({
  onCancel,
  passwordLabel,
  retention,
  mfaEnabled,
  fromOnboarding,
}: {
  onCancel: () => void;
  passwordLabel: string;
  retention: RetentionDays;
  mfaEnabled: boolean;
  fromOnboarding: boolean;
}) {
  const t = useTranslations('privacyCenter');
  const td = useTranslations('privacyCenter.deletion');
  const [state, action] = useActionState(
    fromOnboarding ? closeMinorAccountFromOnboardingAction : closeMinorAccountAction,
    INITIAL_FORM_STATE,
  );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <p className="text-sm">{t('minorConfirmBody', { ...retention })}</p>
      <FormMessage state={state} />
      <TextField
        name="password"
        type="password"
        label={passwordLabel}
        hint={t('minorPassword')}
        error={state.fieldErrors?.password}
        autoComplete="current-password"
        required
      />
      {mfaEnabled ? (
        <TextField
          name="mfaCode"
          label={td('mfaCode')}
          hint={td('mfaHint')}
          autoComplete="one-time-code"
          required
        />
      ) : null}
      <div className="flex flex-wrap gap-3">
        <SubmitButton>{t('minorConfirm')}</SubmitButton>
        <Button variant="secondary" onClick={onCancel}>
          {t('minorCancel')}
        </Button>
      </div>
    </form>
  );
}
