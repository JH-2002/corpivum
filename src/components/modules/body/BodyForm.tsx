'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { saveBodyAction } from '@/app/(app)/corpo/actions';
import { FormMessage, SubmitButton, TextField } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE, preventSubmit } from '@/components/forms/form-state';
import { MEASURE_UNITS } from '@/components/health/format';
import { BODY_FIELDS, BODY_RANGES, type BodyField } from '@/modules/body';

export type BodyFormValues = { id?: string; measuredAt: string } & Record<BodyField, number | null>;

/**
 * Cada campo diz o que é, como medir e traz um exemplo de formato (9d). O "como medir" das circunferências segue o
 * protocolo do modelo 3D (scripts/assets/README.md): o que a pessoa mede é o que a malha mede. Textos RASCUNHO
 * (`LEGAL-REVIEW`, OI-24 e OI-41). A unidade vem de `MEASURE_UNITS`, a mesma das medidas exibidas.
 *
 * Medição (§23): todos os campos opcionais, pelo menos um preenchido. Vírgula decimal aceita.
 */
export function BodyForm({
  values,
  maxDateTime,
  example = false,
}: {
  values: BodyFormValues;
  maxDateTime: string;
  /** Exemplo da demo (ADR-0047): o `<form>` sai sem a server action e não envia nada. */
  example?: boolean;
}) {
  const t = useTranslations('body');
  const [state, action] = useActionState(saveBodyAction, INITIAL_FORM_STATE);
  const err = state.fieldErrors ?? {};
  return (
    <form
      action={example ? undefined : action}
      onSubmit={example ? preventSubmit : undefined}
      className="flex flex-col gap-4"
      noValidate
    >
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <TextField
        name="measuredAt"
        type="datetime-local"
        label={t('form.measuredAt')}
        defaultValue={values.measuredAt}
        max={maxDateTime}
        required
        what={t('help.measuredAt.what')}
        error={err.measuredAt}
        className="sm:max-w-xs"
      />
      <p className="text-sm text-fg-muted">{t('form.hint')}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BODY_FIELDS.map((field) => (
          <TextField
            key={field}
            name={field}
            type="text"
            inputMode="decimal"
            label={t(`fields.${field}`)}
            unit={MEASURE_UNITS[field]}
            what={t(`help.${field}.what`)}
            howTo={t(`help.${field}.how`)}
            example={t(`help.${field}.example`)}
            hint={t('form.range', { min: BODY_RANGES[field][0], max: BODY_RANGES[field][1] })}
            defaultValue={values[field]?.toString().replace('.', ',') ?? ''}
            error={err[field]}
          />
        ))}
      </div>
      <FormMessage state={state} />
      <SubmitButton className="self-start">
        {values.id ? t('form.update') : t('form.save')}
      </SubmitButton>
    </form>
  );
}
