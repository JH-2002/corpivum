'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState } from 'react';
import { saveGoalAction } from '@/app/(app)/metas/actions';
import { FormMessage, SubmitButton, TextField } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE, preventSubmit, type FormState } from '@/components/forms/form-state';
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
 * Bloqueio do guardrail como resultado do envio (7d, LEG-X01, WCAG 4.1.3): como o `FormMessage`, recebe o foco e
 * é anunciado pelo leitor de tela; sem isso, quem não vê a tela não saberia que a meta não foi criada.
 */
function BlockedNotice({ reasons, state }: { reasons: GuardrailReason[]; state: FormState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [state]);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="rounded-lg outline-none focus-visible:ring-2"
    >
      <GuardrailNotice reasons={reasons} />
    </div>
  );
}

/**
 * Meta (§30). O servidor decide com `checkGoal` e os dados do banco (LEG-M04, LEG-M07). Quando bloqueia, o
 * formulário mostra só o aviso de guardrail: sem números restritivos e sem propor outro alvo ou prazo.
 */
export function GoalForm({
  values,
  habits,
  estimateEnabled,
  minDay,
  example = false,
}: {
  values: GoalFormValues;
  habits: ReadonlyArray<{ id: string; name: string }>;
  estimateEnabled: boolean;
  /** Primeiro dia aceito no prazo (amanhã). */
  minDay: string;
  /** Exemplo da demo (ADR-0047): o `<form>` sai sem a server action e não envia nada. */
  example?: boolean;
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
      action={example ? undefined : action}
      onSubmit={example ? preventSubmit : undefined}
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
          what={t('help.metric.what')}
          value={metric}
          onValueChange={(v) => setMetric(v as GoalMetric)}
          error={err.metric}
          options={metrics.map((m) => ({ value: m, label: t(`metrics.${m}`) }))}
        />
        <TextField
          name="targetValue"
          inputMode="decimal"
          label={t('form.target')}
          {...(metric === 'sleep_avg_minutes'
            ? {
                unit: 'min' as const,
                what: t('help.targetSleep.what'),
              }
            : { what: t('help.target.what', { unit: t(`units.${metric}`) }) })}
          defaultValue={values.targetValue ?? ''}
          required
          error={err.targetValue}
        />
        {metric === 'habit_completion_pct' ? (
          <SelectField
            name="habitId"
            label={t('form.habit')}
            what={t('help.habit.what')}
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
          what={t('help.targetDay.what')}
          hint={metric === 'weight_kg' ? t('form.targetDayHint') : undefined}
          min={minDay}
          defaultValue={values.targetDay ?? ''}
          error={err.targetDay}
        />
      </div>
      {!estimateEnabled ? <p className="text-sm text-fg-muted">{t('form.kcalHidden')}</p> : null}
      {reasons.length > 0 ? (
        <BlockedNotice reasons={reasons} state={state} />
      ) : (
        <FormMessage state={state} />
      )}
      <SubmitButton className="self-start">
        {values.id ? t('form.update') : t('form.save')}
      </SubmitButton>
    </form>
  );
}
