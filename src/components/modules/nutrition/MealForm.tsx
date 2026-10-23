'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { saveMealAction } from '@/app/(app)/alimentacao/actions';
import { FormMessage, SubmitButton, TextField } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE, preventSubmit } from '@/components/forms/form-state';
import { ScaleField, SelectField, TextAreaField } from '@/components/forms/HealthFields';
import { MEAL_CATEGORIES, MEAL_PERCEPTIONS, type MealCategory } from '@/modules/nutrition';

export interface MealFormValues {
  id?: string;
  eatenAt: string;
  category: MealCategory;
  description: string | null;
  hunger: number | null;
  fullness: number | null;
  satisfaction: number | null;
  kcalEstimate: number | null;
  note: string | null;
}

/**
 * Registro de refeição (§25). Categoria e horário bastam; o resto fica em "Mais detalhes". Sem rótulo de
 * comida e sem sugestão de cardápio (LEG-M07, LEG-M08). O campo de calorias só existe com a estimativa
 * ligada. Descrição e nota são cifradas antes de ir ao banco (LEG-S02).
 */
export function MealForm({
  values,
  maxDateTime,
  estimateEnabled,
  example = false,
}: {
  values: MealFormValues;
  maxDateTime: string;
  estimateEnabled: boolean;
  /** Exemplo da demo (ADR-0047): o `<form>` sai sem a server action e não envia nada. */
  example?: boolean;
}) {
  const t = useTranslations('nutrition');
  const [state, action] = useActionState(saveMealAction, INITIAL_FORM_STATE);
  const err = state.fieldErrors ?? {};
  const hasDetails =
    values.hunger !== null ||
    values.fullness !== null ||
    values.satisfaction !== null ||
    values.note !== null;
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
          name="category"
          label={t('form.category')}
          what={t('help.category.what')}
          defaultValue={values.category}
          error={err.category}
          options={MEAL_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
        />
        <TextField
          name="eatenAt"
          type="datetime-local"
          label={t('form.eatenAt')}
          what={t('help.eatenAt.what')}
          defaultValue={values.eatenAt}
          max={maxDateTime}
          required
          error={err.eatenAt}
        />
      </div>
      <TextField
        name="description"
        label={t('form.description')}
        what={t('help.description.what')}
        example={t('help.description.example')}
        maxLength={300}
        defaultValue={values.description ?? ''}
        error={err.description}
      />
      {estimateEnabled ? (
        <TextField
          name="kcalEstimate"
          type="number"
          inputMode="numeric"
          min={1}
          max={5000}
          label={t('form.kcal')}
          unit="kcal"
          what={t('help.kcal.what')}
          defaultValue={values.kcalEstimate ?? ''}
          error={err.kcalEstimate}
        />
      ) : null}
      <details open={hasDetails} className="group">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">
          {t('form.more')}
        </summary>
        <div className="mt-2 flex flex-col gap-4">
          {MEAL_PERCEPTIONS.map((p) => (
            <ScaleField
              key={p}
              name={p}
              legend={t(`perceptions.${p}`)}
              low={t('perceptions.low')}
              high={t('perceptions.high')}
              what={t(`help.${p}.what`)}
              defaultValue={values[p]}
              error={err[p]}
            />
          ))}
          <TextAreaField
            name="note"
            label={t('form.note')}
            what={t('help.note.what')}
            maxLength={1000}
            defaultValue={values.note ?? ''}
            error={err.note}
          />
        </div>
      </details>
      <FormMessage state={state} />
      <SubmitButton className="self-start">
        {values.id ? t('form.update') : t('form.save')}
      </SubmitButton>
    </form>
  );
}
