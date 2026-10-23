'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { saveSleepAction } from '@/app/(app)/sono/actions';
import { FormMessage, SubmitButton, TextField } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE, preventSubmit } from '@/components/forms/form-state';
import { SelectField, TextAreaField } from '@/components/forms/HealthFields';

export interface SleepFormValues {
  id?: string;
  bedAt: string;
  wakeAt: string;
  quality: number | null;
  awakenings: number | null;
  note: string | null;
}

/** Registro de sono (§20). A nota é cifrada antes de ir ao banco (LEG-S02). */
export function SleepForm({
  values,
  maxDateTime,
  example = false,
}: {
  values: SleepFormValues;
  maxDateTime: string;
  /** Exemplo da demo (ADR-0047): o `<form>` sai sem a server action e não envia nada. */
  example?: boolean;
}) {
  const t = useTranslations('sleep.form');
  const help = useTranslations('sleep.help');
  const [state, action] = useActionState(saveSleepAction, INITIAL_FORM_STATE);
  const err = state.fieldErrors ?? {};
  return (
    <form
      action={example ? undefined : action}
      onSubmit={example ? preventSubmit : undefined}
      className="flex flex-col gap-4"
      noValidate
    >
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="bedAt"
          type="datetime-local"
          label={t('bedAt')}
          what={help('bedAt.what')}
          howTo={help('bedAt.how')}
          defaultValue={values.bedAt}
          max={maxDateTime}
          required
          error={err.bedAt}
        />
        <TextField
          name="wakeAt"
          type="datetime-local"
          label={t('wakeAt')}
          what={help('wakeAt.what')}
          howTo={help('wakeAt.how')}
          defaultValue={values.wakeAt}
          max={maxDateTime}
          required
          error={err.wakeAt}
        />
        <SelectField
          name="quality"
          label={t('quality')}
          what={help('quality.what')}
          defaultValue={values.quality?.toString() ?? ''}
          error={err.quality}
          options={[
            { value: '', label: t('notInformed') },
            ...([1, 2, 3, 4, 5] as const).map((v) => ({
              value: String(v),
              label: t(`qualityLevels.${v}`),
            })),
          ]}
        />
        <TextField
          name="awakenings"
          type="number"
          inputMode="numeric"
          min={0}
          max={50}
          label={t('awakenings')}
          what={help('awakenings.what')}
          example={help('awakenings.example')}
          defaultValue={values.awakenings ?? ''}
          error={err.awakenings}
        />
      </div>
      <TextAreaField
        name="note"
        label={t('note')}
        what={help('note.what')}
        maxLength={1000}
        defaultValue={values.note ?? ''}
        error={err.note}
      />
      <FormMessage state={state} />
      <SubmitButton className="self-start">{values.id ? t('update') : t('save')}</SubmitButton>
    </form>
  );
}
