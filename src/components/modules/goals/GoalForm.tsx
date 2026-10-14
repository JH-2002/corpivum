'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { saveGoalAction } from '@/app/(app)/metas/actions';
import { FormMessage, SubmitButton, TextField } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE } from '@/components/forms/form-state';
import { SelectField } from '@/components/forms/HealthFields';
import { GuardrailNotice } from '@/components/health/GuardrailNotice';
import { GOAL_METRICS, type GoalMetric } from '@/modules/goals';
import { GUARDRAIL_REASONS, type GuardrailReason } from '@/modules/guardrails';

export interface GoalFormValues {
  id?: string;
  metric: GoalMetric;
  targetValue: number | null;
  habitId: string | null;
  targetDay: string | null;
}

const isReason = (v: string): v is GuardrailReason =>
  (GUARDRAIL_REASONS as readonly string[]).includes(v);

/**
 * Meta (§30). O servidor decide com `checkGoal` e os dados do banco (LEG-M04, LEG-M07). Quando bloqueia, o
 * formulário mostra só o aviso de guardrail: sem números restritivos e sem propor outro alvo ou prazo.
 */
export function GoalForm({
  values,
  habits,
  estimateEnabled,
  minDay,
}: {
  values: GoalFormValues;
  habits: ReadonlyArray<{ id: string; name: string }>;
  estimateEnabled: boolean;
  /** Primeiro dia aceito no prazo (amanhã). */
  minDay: string;
}) {
  const t = useTranslations('goals');
  const [state, action] = useActionState(saveGoalAction, INITIAL_FORM_STATE);
  const [metric, setMetric] = useState<GoalMetric>(values.metric);
  const err = state.fieldErrors ?? {};
  const raw = state.data?.reasons;
  const reasons = (Array.isArray(raw) ? raw : []).filter(isReason);
  const metrics = GOAL_METRICS.filter((m) => m !== 'kcal_reference_day' || estimateEnabled);
  return (
    <form
      action={action}
      className="flex flex-col gap-4"
      noValidate
      // Depois da ação o React reseta o formulário: a métrica volta ao valor inicial junto com o select.
      onReset={() => setMetric(values.metric)}
    >
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="metric"
          label={t('form.metric')}
          value={metric}
          onChange={(e) => setMetric(e.target.value as GoalMetric)}
          error={err.metric}
          options={metrics.map((m) => ({ value: m, label: t(`metrics.${m}`) }))}
        />
        <TextField
          name="targetValue"
          inputMode="decimal"
          label={t('form.target')}
          hint={
            metric === 'sleep_avg_minutes'
              ? t('form.sleepHint')
              : t('form.targetHint', { unit: t(`units.${metric}`) })
          }
          defaultValue={values.targetValue ?? ''}
          required
          error={err.targetValue}
        />
        {metric === 'habit_completion_pct' ? (
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
          name="targetDay"
          type="date"
          label={t('form.targetDay')}
          hint={metric === 'weight_kg' ? t('form.targetDayHint') : undefined}
          min={minDay}
          defaultValue={values.targetDay ?? ''}
          error={err.targetDay}
        />
      </div>
      {!estimateEnabled ? <p className="text-sm text-fg-muted">{t('form.kcalHidden')}</p> : null}
      {reasons.length > 0 ? <GuardrailNotice reasons={reasons} /> : <FormMessage state={state} />}
      <SubmitButton className="self-start">
        {values.id ? t('form.update') : t('form.save')}
      </SubmitButton>
    </form>
  );
}
