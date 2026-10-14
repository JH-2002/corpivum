import { dbDateToIso, isoToDbDate, localDay } from '@/lib/dates';
import type { Tx } from '@/lib/db';
import { checkGoal, type GuardrailReason } from '@/modules/guardrails';
import type { HealthDeps } from '@/modules/health/core';
import type { GoalInput } from './schemas';
import type { GoalRecord } from './types';

export type GoalWriteResult =
  | { ok: true; id: string }
  | { ok: false; reasons: GuardrailReason[] }
  | { ok: false; error: 'habit_not_found' };

interface GuardContext {
  currentWeightKg: number | null;
  heightCm: number | null;
  calorieEstimateEnabled: boolean;
}

/** Peso e altura mais recentes e a preferência de calorias, do banco (nunca do formulário). */
async function guardContext(tx: Tx, userId: string): Promise<GuardContext> {
  const [weight, height, user] = await Promise.all([
    tx.bodyMeasurement.findFirst({
      where: { weightKg: { not: null } },
      orderBy: { measuredAt: 'desc' },
      select: { weightKg: true },
    }),
    tx.bodyMeasurement.findFirst({
      where: { heightCm: { not: null } },
      orderBy: { measuredAt: 'desc' },
      select: { heightCm: true },
    }),
    tx.user.findUnique({ where: { id: userId }, select: { calorieEstimateEnabled: true } }),
  ]);
  return {
    currentWeightKg: weight?.weightKg ?? null,
    heightCm: height?.heightCm ?? null,
    calorieEstimateEnabled: user?.calorieEstimateEnabled ?? false,
  };
}

/** Motivos que impedem a meta. Vazio = pode gravar. Nenhum caminho sugere outro alvo (LEG-M04). */
function blockers(input: GoalInput, ctx: GuardContext, today: string): GuardrailReason[] {
  const reasons = new Set<GuardrailReason>();
  if (input.targetDay !== null && input.targetDay <= today) reasons.add('invalid_date');
  const guard =
    input.domain === 'weight'
      ? checkGoal({
          domain: 'weight',
          currentWeightKg: ctx.currentWeightKg,
          heightCm: ctx.heightCm,
          targetValue: input.targetValue,
          today,
          targetDay: input.targetDay,
        })
      : input.domain === 'nutrition'
        ? checkGoal({
            domain: 'nutrition',
            calorieEstimateEnabled: ctx.calorieEstimateEnabled,
            targetValue: input.targetValue,
          })
        : checkGoal({ domain: input.domain, targetValue: input.targetValue });
  if (!guard.ok) for (const r of guard.reasons) reasons.add(r);
  return [...reasons];
}

/**
 * Metas (§30, LEG-M04, LEG-M06, LEG-M07). Toda gravação passa por `checkGoal` no servidor, com o peso, a
 * altura e a preferência de calorias lidos do banco na mesma transação. Bloqueada = nada é gravado. Acesso
 * por `deps.run` (consentimento + RLS). Sem texto livre. O serviço não loga.
 */
export function createGoalsService(deps: HealthDeps) {
  const now = deps.now ?? (() => new Date());

  async function habitOk(tx: Tx, habitId: string | null): Promise<boolean> {
    if (habitId === null) return true;
    const habit = await tx.habit.findFirst({
      where: { id: habitId, archivedAt: null },
      select: { id: true },
    });
    return habit !== null;
  }

  return {
    async list(userId: string, opts: { includeArchived?: boolean } = {}): Promise<GoalRecord[]> {
      const rows = await deps.run(userId, (tx) =>
        tx.goal.findMany({
          where: opts.includeArchived ? {} : { status: 'active' },
          orderBy: { createdAt: 'asc' },
        }),
      );
      return rows.map((r) => ({
        id: r.id,
        domain: r.domain,
        metric: r.metric,
        targetValue: r.targetValue,
        startValue: r.startValue,
        habitId: r.habitId,
        targetDay: r.targetDay ? dbDateToIso(r.targetDay) : null,
        status: r.status,
        createdDay: localDay(r.createdAt, deps.timeZone),
      }));
    },

    async create(userId: string, input: GoalInput): Promise<GoalWriteResult> {
      const today = localDay(now(), deps.timeZone);
      return deps.run(userId, async (tx) => {
        const ctx = await guardContext(tx, userId);
        const reasons = blockers(input, ctx, today);
        if (reasons.length > 0) return { ok: false, reasons } as const;
        if (!(await habitOk(tx, input.habitId)))
          return { ok: false, error: 'habit_not_found' } as const;
        const row = await tx.goal.create({
          data: {
            userId,
            domain: input.domain,
            metric: input.metric,
            targetValue: input.targetValue,
            startValue: input.domain === 'weight' ? ctx.currentWeightKg : null,
            habitId: input.habitId,
            habitUserId: input.habitId === null ? null : userId,
            targetDay: input.targetDay === null ? null : isoToDbDate(input.targetDay),
          },
          select: { id: true },
        });
        return { ok: true, id: row.id } as const;
      });
    },

    /**
     * Edita reaplicando `checkGoal`. A meta de peso mantém o peso de partida original (base da barra);
     * `null` = não encontrada.
     */
    async update(userId: string, id: string, input: GoalInput): Promise<GoalWriteResult | null> {
      const today = localDay(now(), deps.timeZone);
      return deps.run(userId, async (tx) => {
        const existing = await tx.goal.findFirst({
          where: { id },
          select: { metric: true, startValue: true },
        });
        if (!existing) return null;
        const ctx = await guardContext(tx, userId);
        const reasons = blockers(input, ctx, today);
        if (reasons.length > 0) return { ok: false, reasons } as const;
        if (!(await habitOk(tx, input.habitId)))
          return { ok: false, error: 'habit_not_found' } as const;
        const startValue =
          input.domain !== 'weight'
            ? null
            : existing.metric === 'weight_kg' && existing.startValue !== null
              ? existing.startValue
              : ctx.currentWeightKg;
        await tx.goal.updateMany({
          where: { id },
          data: {
            domain: input.domain,
            metric: input.metric,
            targetValue: input.targetValue,
            startValue,
            habitId: input.habitId,
            habitUserId: input.habitId === null ? null : userId,
            targetDay: input.targetDay === null ? null : isoToDbDate(input.targetDay),
          },
        });
        return { ok: true, id } as const;
      });
    },

    async setArchived(userId: string, id: string, archived: boolean): Promise<boolean> {
      const { count } = await deps.run(userId, (tx) =>
        tx.goal.updateMany({ where: { id }, data: { status: archived ? 'archived' : 'active' } }),
      );
      return count === 1;
    },

    async remove(userId: string, id: string): Promise<boolean> {
      const { count } = await deps.run(userId, (tx) => tx.goal.deleteMany({ where: { id } }));
      return count === 1;
    },
  };
}

export type GoalsService = ReturnType<typeof createGoalsService>;
