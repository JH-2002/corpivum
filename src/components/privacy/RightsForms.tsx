'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { deleteAccountAction, openPrivacyRequestAction } from '@/app/(app)/privacidade/actions';
import { Checkbox } from '@/components/forms/Checkbox';
import { FormMessage, SubmitButton, TextField } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE, type FormState } from '@/components/forms/form-state';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DELETION_PHRASE } from '@/modules/privacy/deletion';
import { OPENABLE_REQUEST_KINDS, type OpenableRequestKind } from '@/modules/privacy/requests';

const OPTION_CLASS =
  'flex min-h-11 items-start gap-3 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary';
const linkClass = 'font-semibold text-primary underline underline-offset-2';

/**
 * Pedidos do titular (LEG-D07): escolha do tipo e confirmação imediata na tela, com protocolo, tipo, data e
 * prazo. O que acontece depois depende do tipo (atendido na hora, cópia em geração ou resposta do encarregado).
 */
export function PrivacyRequestForm() {
  const t = useTranslations('privacyCenter');
  const [state, action] = useActionState(openPrivacyRequestAction, INITIAL_FORM_STATE);
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">{t('requests.kindLegend')}</legend>
          {OPENABLE_REQUEST_KINDS.map((kind, i) => (
            <div key={kind} className={OPTION_CLASS}>
              <input
                id={`request-kind-${kind}`}
                type="radio"
                name="kind"
                value={kind}
                defaultChecked={i === 0}
                aria-describedby={`request-kind-${kind}-hint`}
                className="mt-0.5 size-5 shrink-0 accent-primary"
              />
              <div>
                <label htmlFor={`request-kind-${kind}`} className="block font-semibold">
                  {t(`requestKind.${kind}`)}
                </label>
                <p id={`request-kind-${kind}-hint`} className="text-fg-muted">
                  {t(`requests.describe.${kind}`)}
                </p>
              </div>
            </div>
          ))}
        </fieldset>
        <div>
          <SubmitButton variant="primary">{t('requests.submit')}</SubmitButton>
        </div>
      </form>
      <FormMessage state={state} />
      {state.status === 'success' && state.data ? <RequestReceipt data={state.data} /> : null}
    </div>
  );
}

function RequestReceipt({ data }: { data: NonNullable<FormState['data']> }) {
  const t = useTranslations('privacyCenter');
  const text = (key: string) => (typeof data[key] === 'string' ? data[key] : '');
  const kind = text('kind') as OpenableRequestKind;
  const status = text('requestStatus');
  const due = text('dueAt');
  const next =
    kind === 'portability' && status === 'completed' ? 'portability_ready' : (kind as string);
  return (
    <section
      aria-labelledby="request-receipt"
      className="flex flex-col gap-2 rounded-md border border-border-strong p-4 text-sm"
      data-testid="request-receipt"
    >
      <h3 id="request-receipt" className="text-base font-semibold">
        {t('requests.receiptTitle')}
      </h3>
      <dl className="grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt className="font-semibold">{t('requests.protocol')}</dt>
        <dd className="font-mono break-all">{text('protocol')}</dd>
        <dt className="font-semibold">{t('requests.kind')}</dt>
        <dd>{t(`requestKind.${kind}`)}</dd>
        <dt className="font-semibold">{t('requests.status')}</dt>
        <dd>{t(`requestStatus.${status as 'open'}`)}</dd>
        <dt className="font-semibold">{t('requests.openedAt')}</dt>
        <dd>{text('openedAt')}</dd>
        <dt className="font-semibold">{t('requests.dueAt')}</dt>
        <dd>{due}</dd>
      </dl>
      <p>{t(`requests.next.${next as 'correction'}`, { date: due })}</p>
      {kind === 'confirmation_access' || kind === 'portability' || kind === 'correction' ? (
        <a href="#seus-dados" className={linkClass}>
          {t('requests.toData')}
        </a>
      ) : null}
      {kind === 'sharing_info' ? (
        <Link href="/legal/subprocessadores" className={linkClass}>
          {t('subprocessorsPublic')}
        </Link>
      ) : null}
      {kind === 'anonymization' ? (
        <a href="#excluir-conta" className={linkClass}>
          {t('requests.toDeletion')}
        </a>
      ) : null}
      <p className="text-fg-muted">{t('requests.emailNote')}</p>
    </section>
  );
}

/** Prazos do que fica depois da exclusão (texto exato, como no encerramento de menor). */
export interface DeletionRetention {
  proofDays: number;
  accessDays: number;
  backupDays: number;
}

/**
 * Exclusão de conta (LEG-D04): confirmação reforçada num diálogo. Sem cópia pronta, é preciso marcar "não
 * quero baixar meus dados"; senha atual e, com MFA, o código; e a frase exata (conferida no servidor).
 */
export function AccountDeletionDialog({
  mfaEnabled,
  hasExport,
  retention,
}: {
  mfaEnabled: boolean;
  /** Há uma cópia completa pronta para baixar agora. */
  hasExport: boolean;
  retention: DeletionRetention;
}) {
  const t = useTranslations('privacyCenter.deletion');
  return (
    <ConfirmDialog triggerLabel={t('start')} title={t('confirmTitle')}>
      {(close) => (
        <AccountDeletionForm
          onCancel={close}
          mfaEnabled={mfaEnabled}
          hasExport={hasExport}
          retention={retention}
        />
      )}
    </ConfirmDialog>
  );
}

function AccountDeletionForm({
  onCancel,
  mfaEnabled,
  hasExport,
  retention,
}: {
  onCancel: () => void;
  mfaEnabled: boolean;
  hasExport: boolean;
  retention: DeletionRetention;
}) {
  const t = useTranslations('privacyCenter.deletion');
  const ta = useTranslations('auth.fields');
  const [state, action] = useActionState(deleteAccountAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <p className="text-sm">{t('confirmBody', { ...retention })}</p>
      <FormMessage state={state} />
      {hasExport ? (
        <p className="text-sm">{t('exportReady')}</p>
      ) : (
        <Checkbox
          name="skipExport"
          label={t('skipExport')}
          description={t('skipExportHint')}
          error={state.fieldErrors?.skipExport}
        />
      )}
      <TextField
        name="password"
        type="password"
        label={ta('currentPassword')}
        error={state.fieldErrors?.password}
        autoComplete="current-password"
        required
      />
      {mfaEnabled ? (
        <TextField
          name="mfaCode"
          label={t('mfaCode')}
          hint={t('mfaHint')}
          autoComplete="one-time-code"
          inputMode="text"
          required
        />
      ) : null}
      <TextField
        name="phrase"
        label={t('phraseLabel', { phrase: DELETION_PHRASE })}
        error={state.fieldErrors?.phrase}
        autoComplete="off"
        spellCheck={false}
        required
      />
      <div className="flex flex-wrap gap-3">
        <SubmitButton variant="primary">{t('confirm')}</SubmitButton>
        <Button variant="secondary" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
