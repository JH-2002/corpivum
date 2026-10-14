'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { saveReminderAction, saveReminderPrefsAction } from '@/app/(app)/habitos/reminder-actions';
import { FormMessage, SubmitButton, TextField } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE } from '@/components/forms/form-state';
import { OptionGroup, SelectField } from '@/components/forms/HealthFields';
import { WEEK_ORDER } from '@/lib/dates';
import {
  formatTime,
  REMINDER_KINDS,
  type ReminderKind,
  type ReminderPrefs,
} from '@/modules/notifications';

export interface ReminderFormValues {
  id?: string;
  kind: ReminderKind;
  habitId: string | null;
  timeMin: number;
  weekdays: number[];
}

/** Lembrete (§33): tipo, hábito, horário e dias. O e-mail não leva o nome do hábito. */
export function ReminderForm({
  values,
  habits,
}: {
  values: ReminderFormValues;
  habits: ReadonlyArray<{ id: string; name: string }>;
}) {
  const t = useTranslations('reminders');
  const th = useTranslations('habits');
  const [state, action] = useActionState(saveReminderAction, INITIAL_FORM_STATE);
  const [kind, setKind] = useState<ReminderKind>(values.kind);
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="kind"
          label={t('form.kind')}
          value={kind}
          onChange={(e) => setKind(e.target.value as ReminderKind)}
          options={REMINDER_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
        />
        {kind === 'habit' ? (
          <SelectField
            name="habitId"
            label={t('form.habit')}
            defaultValue={values.habitId ?? ''}
            error={err.habitId}
            options={[
              { value: '', label: t('form.habitNone') },
              ...habits.map((h) => ({ value: h.id, label: h.name })),
            ]}
          />
        ) : null}
        <TextField
          name="time"
          type="time"
          label={t('form.time')}
          defaultValue={formatTime(values.timeMin)}
          required
          error={err.time}
        />
      </div>
      <OptionGroup
        name="weekdays"
        legend={t('form.weekdays')}
        hint={t('form.weekdaysHint')}
        options={WEEK_ORDER.map((d) => ({ value: String(d), label: th(`weekdayShort.${d}`) }))}
        defaultValues={values.weekdays.map(String)}
      />
      <FormMessage state={state} />
      <SubmitButton className="self-start">
        {values.id ? t('form.update') : t('form.save')}
      </SubmitButton>
    </form>
  );
}

/** Preferências: lembretes por tipo e horário silencioso (§33, §46). */
export function ReminderPrefsForm({ prefs }: { prefs: ReminderPrefs }) {
  const t = useTranslations('reminders.prefs');
  const [state, action] = useActionState(saveReminderPrefsAction, INITIAL_FORM_STATE);
  const err = state.fieldErrors ?? {};
  const time = (min: number | null) => (min === null ? '' : formatTime(min));
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="remindHabits"
          defaultChecked={prefs.remindHabits}
          className="size-5 accent-primary"
        />
        {t('remindHabits')}
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="remindDailyLog"
          defaultChecked={prefs.remindDailyLog}
          className="size-5 accent-primary"
        />
        {t('remindDailyLog')}
      </label>
      <p className="text-sm text-fg-muted">{t('quietHint')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="quietStart"
          type="time"
          label={t('quietStart')}
          defaultValue={time(prefs.quietStartMin)}
          error={err.quietStart}
        />
        <TextField
          name="quietEnd"
          type="time"
          label={t('quietEnd')}
          defaultValue={time(prefs.quietEndMin)}
          error={err.quietEnd}
        />
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" className="self-start">
        {t('save')}
      </SubmitButton>
    </form>
  );
}
