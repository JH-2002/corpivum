'use client';

import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { saveJournalAction } from '@/app/(app)/diario/actions';
import { FormMessage, SubmitButton, TextField } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE } from '@/components/forms/form-state';
import { OptionGroup, SelectField, TextAreaField } from '@/components/forms/HealthFields';
import { JOURNAL_TAGS, type JournalTag } from '@/modules/journal';

export interface JournalFormValues {
  id?: string;
  day: string;
  content: string;
  mood: number | null;
  tags: JournalTag[];
}

/** Entrada do diário (§19). Conteúdo cifrado e sem busca textual (LEG-S02). */
export function JournalForm({ values, maxDay }: { values: JournalFormValues; maxDay: string }) {
  const t = useTranslations('journal');
  const [state, action] = useActionState(saveJournalAction, INITIAL_FORM_STATE);
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="day"
          type="date"
          label={t('form.day')}
          defaultValue={values.day}
          max={maxDay}
          required
          error={err.day}
        />
        <SelectField
          name="mood"
          label={t('form.mood')}
          hint={t('form.moodHint')}
          defaultValue={values.mood?.toString() ?? ''}
          options={[
            { value: '', label: t('form.noMood') },
            ...[1, 2, 3, 4, 5].map((v) => ({ value: String(v), label: String(v) })),
          ]}
        />
      </div>
      <TextAreaField
        name="content"
        label={t('form.content')}
        hint={
          <span className="inline-flex items-start gap-1">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t('form.contentHint')}
          </span>
        }
        rows={8}
        maxLength={10000}
        required
        defaultValue={values.content}
        error={err.content}
      />
      <OptionGroup
        name="tags"
        legend={t('form.tags')}
        hint={t('form.tagsHint')}
        defaultValues={values.tags}
        options={JOURNAL_TAGS.map((tag) => ({ value: tag, label: t(`tags.${tag}`) }))}
      />
      <FormMessage state={state} />
      <SubmitButton className="self-start">
        {values.id ? t('form.update') : t('form.save')}
      </SubmitButton>
    </form>
  );
}
