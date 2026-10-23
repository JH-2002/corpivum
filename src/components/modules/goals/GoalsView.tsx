import { useFormatter, useTranslations } from 'next-intl';
import { archiveGoalAction, deleteGoalAction } from '@/app/(app)/metas/actions';
import { SubmitButton } from '@/components/forms/FormFields';
import { ExampleForm } from '@/components/forms/ExampleForm';
import { EntryActions } from '@/components/health/EntryActions';
import { GuardrailNotice } from '@/components/health/GuardrailNotice';
import { formatDecimal, TREND_ARROW, trendOf } from '@/components/health/format';
import type { HealthMode } from '@/components/health/HealthPage';
import { PeriodSummary } from '@/components/insights/PeriodInsights';
import { HiddenEditNotice } from '@/components/privacy-mode/Masked';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { StateView } from '@/components/ui/StateView';
import { addDays } from '@/lib/dates';
import type { GoalMetric, GoalProgress, GoalRecord } from '@/modules/goals';
import { formatGoalValue } from './goal-value';
import { isBodyValueGoal } from '@/modules/health/mask';
import type { GuardrailReason } from '@/modules/guardrails';
import type { HabitRecord } from '@/modules/habits';
import { goalsInsights } from '@/modules/insights';
import { GoalForm } from './GoalForm';

/**
 * Tela de metas (§30, LEG-M04, LEG-M06, LEG-F05): criar, acompanhar com barra (valor em texto, nunca só
 * cor), ajustar, arquivar e excluir. Peso só em número, seta e palavra, sem barra, sem sequência e sem
 * comemoração. Prazo encerrado em tom neutro. Meta de calorias em pausa com a estimativa desligada.
 * Modo privacidade (`hidden`, ADR-0035): metas de peso e de calorias sem alvo, progresso nem edição (os dados
 * já chegam sem esses valores, `maskGoalsScreen`).
 */
export function GoalsView({
  goals,
  habits,
  progress,
  suspended,
  estimateEnabled,
  today,
  mode,
  hidden = false,
}: {
  goals: GoalRecord[];
  habits: HabitRecord[];
  progress: GoalProgress[];
  /** Metas de peso que hoje seriam bloqueadas: sem acompanhamento, só o aviso (LEG-M04). */
  suspended: Readonly<Record<string, readonly GuardrailReason[]>>;
  estimateEnabled: boolean;
  today: string;
  mode: HealthMode;
  hidden?: boolean;
}) {
  const t = useTranslations('goals');
  const tm = useTranslations('privacyMode');
  const tp = useTranslations('pages.goals');
  const format = useFormatter();
  const own = mode === 'own';
  const level = (l: 'INFORMADO' | 'ESTIMADO') => (own ? l : 'DEMO');
  const byId = new Map(progress.map((p) => [p.goalId, p]));
  const habitName = (id: string | null) => habits.find((h) => h.id === id)?.name ?? '';
  const active = goals.filter((g) => g.status === 'active');
  const archived = goals.filter((g) => g.status === 'archived');
  const shortDate = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });
  const habitOptions = habits.filter((h) => !h.archived).map((h) => ({ id: h.id, name: h.name }));
  const minDay = addDays(today, 1);

  const title = (g: GoalRecord) =>
    g.metric === 'habit_completion_pct'
      ? `${t(`metrics.${g.metric}`)}: ${habitName(g.habitId)}`
      : t(`metrics.${g.metric}`);

  const valueText = (metric: GoalMetric, value: number) =>
    formatGoalValue(metric, value, (m) => t(`units.${m}`));

  function Progress({ goal }: { goal: GoalRecord }) {
    const p = byId.get(goal.id);
    if (!p) return null;
    if (hidden && isBodyValueGoal(goal.metric)) {
      return <p className="text-sm text-fg-muted">{tm('goalHidden')}</p>;
    }
    if (goal.metric === 'kcal_reference_day') {
      // Calorias: só o total do dia e a referência, em texto. Sem barra, porcentagem nem "alcançado"
      // (comer uma quantidade não é conquista nem teto, LEG-M07, revisão M2).
      if (!estimateEnabled) return <p className="text-sm text-fg-muted">{t('progress.paused')}</p>;
      return (
        <p className="tabular text-sm">
          {p.current === null
            ? t('progress.kcalNone', { target: formatDecimal(goal.targetValue) })
            : t('progress.kcal', {
                current: formatDecimal(p.current),
                target: formatDecimal(goal.targetValue),
              })}
        </p>
      );
    }
    if (goal.metric === 'weight_kg') {
      const trend = trendOf(p.weightChangeKg, 0.05);
      return (
        <div className="flex flex-col gap-1 text-sm">
          <p className="tabular">
            {p.current === null
              ? t('progress.weightNone')
              : t('progress.weightNow', {
                  current: formatDecimal(p.current),
                  target: formatDecimal(goal.targetValue),
                })}
          </p>
          {p.weightChangeKg !== null && trend ? (
            <p className="tabular">
              {t('progress.weightChange', {
                arrow: TREND_ARROW[trend],
                delta: formatDecimal(Math.abs(p.weightChangeKg)),
                word: trend,
              })}
            </p>
          ) : null}
        </div>
      );
    }
    const percent = Math.round(p.ratio * 100);
    const text =
      p.current === null
        ? t('progress.none')
        : t(p.window === 'day' ? 'progress.day' : 'progress.week', {
            current: valueText(goal.metric, p.current),
            target: valueText(goal.metric, goal.targetValue),
          });
    return (
      <div className="flex flex-col gap-1 text-sm">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={text}
          aria-label={title(goal)}
          className="h-3 w-full overflow-hidden rounded-full border border-border-strong bg-surface-muted"
        >
          {/* Enche ao aparecer (9f); só metas de hábito, sono e atividade chegam aqui (peso e calorias, não). */}
          <div className="hm-grow h-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        <p className="tabular">
          {text} · {t('progress.barLabel', { percent })}
        </p>
        {p.reached ? <p>{t('progress.reached')}</p> : null}
      </div>
    );
  }

  function GoalItem({ goal }: { goal: GoalRecord }) {
    const p = byId.get(goal.id);
    const archivedGoal = goal.status === 'archived';
    const blocked = suspended[goal.id] ?? [];
    return (
      <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-semibold">{title(goal)}</h3>
          <ConfidenceBadge
            level={level(
              goal.metric === 'weight_kg' || goal.metric === 'kcal_reference_day'
                ? 'INFORMADO'
                : 'ESTIMADO',
            )}
          />
        </div>
        {archivedGoal ? null : hidden && isBodyValueGoal(goal.metric) ? (
          // Nem o aviso do guardrail: ele revela a relação entre alvo, peso e altura (revisão B5). O apoio
          // continua fixo na tela de corpo.
          <p className="text-sm text-fg-muted">{tm('goalHidden')}</p>
        ) : blocked.length > 0 ? (
          <GuardrailNotice reasons={blocked} />
        ) : (
          <Progress goal={goal} />
        )}
        {goal.targetDay ? (
          <p className="text-sm text-fg-muted">
            {t('progress.deadline', { date: shortDate(goal.targetDay) })}
          </p>
        ) : null}
        {!archivedGoal && p?.deadlinePassed ? (
          <p className="text-sm">{t('progress.deadlinePassed')}</p>
        ) : null}
        {own ? (
          <div className="flex flex-col gap-2">
            <form action={archiveGoalAction}>
              <input type="hidden" name="id" value={goal.id} />
              <input type="hidden" name="archived" value={archivedGoal ? 'false' : 'true'} />
              <SubmitButton
                variant="secondary"
                aria-label={t(archivedGoal ? 'unarchiveLabel' : 'archiveLabel', {
                  name: title(goal),
                })}
              >
                {t(archivedGoal ? 'unarchive' : 'archive')}
              </SubmitButton>
            </form>
            <EntryActions id={goal.id} itemLabel={title(goal)} deleteAction={deleteGoalAction}>
              {hidden && isBodyValueGoal(goal.metric) ? (
                <HiddenEditNotice />
              ) : (
                <GoalForm
                  habits={habitOptions}
                  estimateEnabled={estimateEnabled}
                  minDay={minDay}
                  values={{
                    id: goal.id,
                    metric: goal.metric,
                    targetValue: goal.targetValue,
                    habitId: goal.habitId,
                    targetDay: goal.targetDay,
                  }}
                />
              )}
            </EntryActions>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-fg-muted">{t('intro')}</p>
      <PeriodSummary insights={goalsInsights({ goals, progress })} demo={!own} />

      <section
        id="novo"
        aria-labelledby="goal-new"
        className="scroll-mt-32 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="goal-new" className="mb-3 text-base font-semibold">
          {t('newTitle')}
        </h2>
        <p className="mb-3 text-sm text-fg-muted">{t('weightNote')}</p>
        {own ? (
          <GoalForm
            habits={habitOptions}
            estimateEnabled={estimateEnabled}
            minDay={minDay}
            values={{
              metric: 'activity_minutes_week',
              targetValue: null,
              habitId: null,
              targetDay: null,
            }}
          />
        ) : (
          <ExampleForm publicDemo={mode === 'publicDemo'}>
            {/* Sem valor-alvo no exemplo: a meta é sempre da pessoa (LEG-M07). */}
            <GoalForm
              example
              habits={habitOptions}
              estimateEnabled={estimateEnabled}
              minDay={minDay}
              values={{
                metric: 'activity_minutes_week',
                targetValue: null,
                habitId: null,
                targetDay: null,
              }}
            />
          </ExampleForm>
        )}
      </section>

      {active.length === 0 ? (
        <StateView
          state="empty"
          emptyTitle={tp('emptyTitle')}
          emptyDescription={tp('emptyDescription')}
          nextStep={own ? t('nextStep') : undefined}
        />
      ) : (
        <section aria-labelledby="goal-list" className="flex flex-col gap-3">
          <h2 id="goal-list" className="text-base font-semibold">
            {t('listTitle')}
          </h2>
          <ul className="grid gap-4 lg:grid-cols-2">
            {active.map((g) => (
              <GoalItem key={g.id} goal={g} />
            ))}
          </ul>
        </section>
      )}

      {archived.length > 0 ? (
        <section aria-labelledby="goal-archived" className="flex flex-col gap-3">
          <h2 id="goal-archived" className="text-base font-semibold">
            {t('archivedTitle')}
          </h2>
          <ul className="grid gap-4 lg:grid-cols-2">
            {archived.map((g) => (
              <GoalItem key={g.id} goal={g} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
