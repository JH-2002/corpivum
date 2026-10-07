'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { saveBodyAction } from '@/app/(app)/corpo/actions';
import { FormMessage, SubmitButton, TextField } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE } from '@/components/forms/form-state';
import { BODY_FIELDS, BODY_RANGES, type BodyField } from '@/modules/body';

export type BodyFormValues = { id?: string; measuredAt: string } & Record<BodyField, number | null>;

const UNITS: Record<BodyField, string> = {
  weightKg: 'kg',
  heightCm: 'cm',
  waistCm: 'cm',
  hipCm: 'cm',
  armCm: 'cm',
  thighCm: 'cm',
  chestCm: 'cm',
  bodyFatPct: '%',
};

/** Medição (§23): todos os campos opcionais, pelo menos um preenchido. Vírgula decimal aceita. */
export function BodyForm({ values, maxDateTime }: { values: BodyFormValues; maxDateTime: string }) {
  const t = useTranslations('body');
  const [state, action] = useActionState(saveBodyAction, INITIAL_FORM_STATE);
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <TextField
        name="measuredAt"
        type="datetime-local"
        label={t('form.measuredAt')}
        defaultValue={values.measuredAt}
        max={maxDateTime}
        required
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
            label={`${t(`fields.${field}`)} (${UNITS[field]})`}
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
