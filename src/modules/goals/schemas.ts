import { z } from 'zod';
import { idSchema, isoDateSchema } from '@/modules/health/zod';
import { round } from '@/lib/stats';
import {
  GOAL_METRICS,
  METRIC_DOMAIN,
  METRIC_RANGE,
  type GoalDomain,
  type GoalMetric,
} from './types';

const emptyToUndefined = (v: unknown) =>
  v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v;

/**
 * Meta (§30). O domínio vem da métrica. A faixa recusa só valor sem sentido; o que é seguro em peso e
 * calorias é decidido no servidor por `checkGoal` (guardrails), com os dados do banco.
 */
export const goalInputSchema = z
  .object({
    metric: z.enum(GOAL_METRICS),
    targetValue: z.preprocess((v) => {
      const e = emptyToUndefined(v);
      return typeof e === 'string' ? e.replace(',', '.') : e;
    }, z.coerce.number().finite()),
    habitId: z.preprocess(emptyToUndefined, idSchema.optional()),
    targetDay: z.preprocess(emptyToUndefined, isoDateSchema.optional()),
  })
  .superRefine((v, ctx) => {
    const { min, max } = METRIC_RANGE[v.metric];
    if (v.targetValue < min || v.targetValue > max) {
      ctx.addIssue({ code: 'custom', path: ['targetValue'], message: 'field' });
    }
    if (v.metric === 'habit_completion_pct' && !v.habitId) {
      ctx.addIssue({ code: 'custom', path: ['habitId'], message: 'habit_required' });
    }
  })
  .transform(
    (
      v,
    ): {
      domain: GoalDomain;
      metric: GoalMetric;
      targetValue: number;
      habitId: string | null;
      targetDay: string | null;
    } => ({
      domain: METRIC_DOMAIN[v.metric],
      metric: v.metric,
      targetValue: v.metric === 'weight_kg' ? round(v.targetValue, 1) : Math.round(v.targetValue),
      habitId: v.metric === 'habit_completion_pct' ? (v.habitId ?? null) : null,
      targetDay: v.targetDay ?? null,
    }),
  );

export type GoalInput = z.output<typeof goalInputSchema>;
