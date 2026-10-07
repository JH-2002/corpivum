'use client';

import { HeartHandshake } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { saveMoodAction } from '@/app/(app)/humor/actions';
import { FormMessage, SubmitButton, TextField } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE } from '@/components/forms/form-state';
import { OptionGroup, ScaleField, TextAreaField } from '@/components/forms/HealthFields';
import { MOOD_EMOTIONS, type MoodEmotion } from '@/modules/mood';

export interface MoodFormValues {
  id?: string;
  loggedAt: string;
  mood: number | null;
  energy: number | null;
  stress: number | null;
  emotions: MoodEmotion[];
  note: string | null;
}

/** Registro rápido de humor, energia e estresse (§21). A nota é cifrada (LEG-S02). */
export function MoodForm({ values, maxDateTime }: { values: MoodFormValues; maxDateTime: string }) {
  const t = useTranslations('mood');
  const td = useTranslations('disclaimer');
  const [state, action] = useActionState(saveMoodAction, INITIAL_FORM_STATE);
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <TextField
        name="loggedAt"
        type="datetime-local"
        label={t('form.loggedAt')}
        defaultValue={values.loggedAt}
        max={maxDateTime}
        required
        error={err.loggedAt}
        className="sm:max-w-xs"
      />
      <ScaleField
        name="mood"
        legend={t('form.mood')}
        low={t('form.moodLow')}
        high={t('form.moodHigh')}
        defaultValue={values.mood}
        required
        error={err.mood}
      />
      <ScaleField
        name="energy"
        legend={t('form.energy')}
        low={t('form.energyLow')}
        high={t('form.energyHigh')}
        defaultValue={values.energy}
        required
        error={err.energy}
      />
      <ScaleField
        name="stress"
        legend={t('form.stress')}
        low={t('form.stressLow')}
        high={t('form.stressHigh')}
        defaultValue={values.stress}
        required
        error={err.stress}
      />
      <OptionGroup
        name="emotions"
        legend={t('form.emotions')}
        hint={t('form.emotionsHint')}
        defaultValues={values.emotions}
        options={MOOD_EMOTIONS.map((e) => ({ value: e, label: t(`emotions.${e}`) }))}
      />
      <TextAreaField
        name="note"
        label={t('form.note')}
        hint={t('form.noteHint')}
        maxLength={500}
        defaultValue={values.note ?? ''}
        error={err.note}
      />
      <FormMessage state={state} />
      {state.status === 'success' && state.data?.support ? (
        <aside
          role="status"
          className="flex items-start gap-3 rounded-lg border border-primary bg-primary-soft p-4 text-sm text-primary-soft-fg"
        >
          <HeartHandshake className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>{td('riskSupport')}</p>
        </aside>
      ) : null}
      <SubmitButton className="self-start">
        {values.id ? t('form.update') : t('form.save')}
      </SubmitButton>
    </form>
  );
}
