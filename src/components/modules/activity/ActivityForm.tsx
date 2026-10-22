'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { saveActivityAction } from '@/app/(app)/atividade/actions';
import { FormMessage, SubmitButton, TextField } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE, preventSubmit } from '@/components/forms/form-state';
import { SelectField, TextAreaField } from '@/components/forms/HealthFields';
import {
  ACTIVITY_TYPES,
  MAX_SETS,
  type ActivityType,
  type StrengthSetRecord,
} from '@/modules/activity';

export interface ActivityFormValues {
  id?: string;
  startedAt: string;
  type: ActivityType;
  durationMin: number | null;
  intensity: number | null;
  distanceKm: number | null;
  note: string | null;
  sets: StrengthSetRecord[];
}

/** Linhas em branco oferecidas além das séries já registradas. */
const BLANK_ROWS = 4;

/**
 * Registro de atividade (§26). Tipo e duração bastam; séries de força são opcionais. O app registra e
 * não sugere carga, série nem treino (LEG-M08). Nota e nome do exercício são cifrados (LEG-S02).
 */
export function ActivityForm({
  values,
  maxDateTime,
  example = false,
}: {
  values: ActivityFormValues;
  maxDateTime: string;
  /** Exemplo da demo (ADR-0047): o `<form>` sai sem a server action e não envia nada. */
  example?: boolean;
}) {
  const t = useTranslations('activity');
  const [state, action] = useActionState(saveActivityAction, INITIAL_FORM_STATE);
  const err = state.fieldErrors ?? {};
  const rows = Math.min(MAX_SETS, values.sets.length + BLANK_ROWS);
  return (
    <form
      action={example ? undefined : action}
      onSubmit={example ? preventSubmit : undefined}
      className="flex flex-col gap-4"
      noValidate
    >
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="type"
          label={t('form.type')}
          defaultValue={values.type}
          error={err.type}
          options={ACTIVITY_TYPES.map((v) => ({ value: v, label: t(`types.${v}`) }))}
        />
        <TextField
          name="startedAt"
          type="datetime-local"
          label={t('form.startedAt')}
          defaultValue={values.startedAt}
          max={maxDateTime}
          required
          error={err.startedAt}
        />
        <TextField
          name="durationMin"
          type="number"
          inputMode="numeric"
          min={1}
          max={1440}
          label={t('form.duration')}
          defaultValue={values.durationMin ?? ''}
          required
          error={err.durationMin}
        />
        <TextField
          name="intensity"
          type="number"
          inputMode="numeric"
          min={1}
          max={10}
          label={t('form.intensity')}
          hint={t('form.intensityHint')}
          defaultValue={values.intensity ?? ''}
          error={err.intensity}
        />
        <TextField
          name="distanceKm"
          inputMode="decimal"
          label={t('form.distance')}
          defaultValue={values.distanceKm ?? ''}
          error={err.distanceKm}
        />
      </div>
      <details open={values.sets.length > 0 || values.type === 'strength'}>
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">
          {t('form.setsTitle')}
        </summary>
        <p className="text-sm text-fg-muted">{t('form.setsHint')}</p>
        {err.sets ? (
          <p className="text-sm font-semibold text-danger">
            <span aria-hidden="true">⚠ </span>
            {err.sets}
          </p>
        ) : null}
        <div className="mt-2 flex flex-col gap-3">
          {Array.from({ length: rows }, (_, i) => {
            const set = values.sets[i];
            return (
              <fieldset
                key={i}
                className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[2fr_1fr_1fr]"
              >
                <legend className="px-1 text-sm font-semibold">
                  {t('form.setLegend', { n: i + 1 })}
                </legend>
                <TextField
                  name="setExercise"
                  label={t('form.exercise')}
                  maxLength={80}
                  defaultValue={set?.exercise ?? ''}
                />
                <TextField
                  name="setReps"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1000}
                  label={t('form.reps')}
                  defaultValue={set?.reps ?? ''}
                />
                <TextField
                  name="setLoad"
                  inputMode="decimal"
                  label={t('form.load')}
                  defaultValue={set?.loadKg ?? ''}
                />
              </fieldset>
            );
          })}
        </div>
      </details>
      <TextAreaField
        name="note"
        label={t('form.note')}
        hint={t('form.noteHint')}
        maxLength={1000}
        defaultValue={values.note ?? ''}
        error={err.note}
      />
      <FormMessage state={state} />
      <SubmitButton className="self-start">
        {values.id ? t('form.update') : t('form.save')}
      </SubmitButton>
    </form>
  );
}
