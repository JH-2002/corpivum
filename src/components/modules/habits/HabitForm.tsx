'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { saveHabitAction } from '@/app/(app)/habitos/actions';
import { FormMessage, SubmitButton, TextField } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE, preventSubmit } from '@/components/forms/form-state';
import { OptionGroup, SelectField } from '@/components/forms/HealthFields';
import { WEEK_ORDER } from '@/lib/dates';
import { HABIT_FREQUENCIES, type HabitFrequency } from '@/modules/habits';

export interface HabitFormValues {
  id?: string;
  name: string;
  frequency: HabitFrequency;
  weekdays: number[];
  timesPerWeek: number | null;
}

/** Criar/editar hábito (§22). O nome é cifrado (pode revelar dado de saúde, LEG-S02). */
export function HabitForm({
  values,
  example = false,
}: {
  values: HabitFormValues;
  /** Exemplo da demo (ADR-0047): o `<form>` sai sem a server action e não envia nada. */
  example?: boolean;
}) {
  const t = useTranslations('habits');
  const [state, action] = useActionState(saveHabitAction, INITIAL_FORM_STATE);
  const [frequency, setFrequency] = useState<HabitFrequency>(values.frequency);
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
        name="name"
        label={t('form.name')}
        hint={t('form.nameHint')}
        defaultValue={values.name}
        maxLength={80}
        required
        error={err.name}
      />
      <SelectField
        name="frequency"
        label={t('form.frequency')}
        value={frequency}
        onChange={(e) => setFrequency(e.target.value as HabitFrequency)}
        options={HABIT_FREQUENCIES.map((f) => ({ value: f, label: t(`frequency.${f}`) }))}
        className="sm:max-w-xs"
      />
      {frequency === 'weekdays' ? (
        <OptionGroup
          name="weekdays"
          legend={t('form.weekdays')}
          defaultValues={values.weekdays.map(String)}
          options={WEEK_ORDER.map((d) => ({ value: String(d), label: t(`weekdayShort.${d}`) }))}
        />
      ) : null}
      {frequency === 'times_per_week' ? (
        <TextField
          name="timesPerWeek"
          type="number"
          inputMode="numeric"
          min={1}
          max={7}
          label={t('form.timesPerWeek')}
          defaultValue={values.timesPerWeek ?? 3}
          error={err.timesPerWeek}
          className="sm:max-w-xs"
        />
      ) : null}
      {err.weekdays ? (
        <p className="text-sm font-semibold text-danger">
          <span aria-hidden="true">⚠ </span>
          {err.weekdays}
        </p>
      ) : null}
      <FormMessage state={state} />
      <SubmitButton className="self-start">
        {values.id ? t('form.update') : t('form.save')}
      </SubmitButton>
    </form>
  );
}
