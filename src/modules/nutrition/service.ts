import {
  daysBetween,
  dbDateToIso,
  fromLocalDateTime,
  isoToDbDate,
  localDay,
  localTime,
  rangeBounds,
} from '@/lib/dates';
import type { Tx } from '@/lib/db';
import type { DateRange } from '@/lib/period';
import { checkCalorieEstimate } from '@/modules/guardrails';
import type { HealthDeps } from '@/modules/health/core';
import { FUTURE_TOLERANCE_MS } from '@/modules/health/zod';
import type { MealInput, WaterInput } from './schemas';
import { WATER_BACKFILL_DAYS, type MealRecord, type WaterRecord } from './types';

const DESCRIPTION = { table: 'meal_entries', column: 'description_enc' } as const;
const NOTE = { table: 'meal_entries', column: 'note_enc' } as const;

export type MealWriteError = 'future' | 'estimate_disabled';
export type MealWriteResult = { ok: true; id: string } | { ok: false; error: MealWriteError };
export type WaterWriteResult = { ok: true; id: string } | { ok: false; error: 'out_of_window' };

/** Estimativa calórica ligada? Lida na mesma transação (preferência da conta, padrão desligada). */
async function estimateEnabled(tx: Tx, userId: string): Promise<boolean> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { calorieEstimateEnabled: true },
  });
  return user?.calorieEstimateEnabled ?? false;
}

/**
 * Alimentação (§25, LEG-M07, LEG-M08). Registra e descreve, nunca recomenda cardápio nem rotula comida.
 * Acesso por `deps.run` (consentimento + RLS); descrição e nota cifradas (LEG-S02). A caloria só entra e
 * só sai com a estimativa ligada: desligar oculta os valores sem apagá-los. O serviço não loga.
 */
export function createNutritionService(deps: HealthDeps) {
  const now = deps.now ?? (() => new Date());

  function instant(input: MealInput): Date | null {
    const at = fromLocalDateTime(input.eatenAt, deps.timeZone);
    return at.getTime() > now().getTime() + FUTURE_TOLERANCE_MS ? null : at;
  }

  async function sealed(userId: string, input: MealInput) {
    return {
      descriptionEnc: input.description
        ? await deps.cipher.seal(userId, DESCRIPTION, input.description)
        : null,
      noteEnc: input.note ? await deps.cipher.seal(userId, NOTE, input.note) : null,
    };
  }

  function values(input: MealInput) {
    return {
      category: input.category,
      hunger: input.hunger ?? null,
      fullness: input.fullness ?? null,
      satisfaction: input.satisfaction ?? null,
      kcalEstimate: input.kcalEstimate ?? null,
    };
  }

  return {
    async listMeals(
      userId: string,
      range: DateRange,
      opts: { withText?: boolean; allStored?: boolean } = {},
    ): Promise<MealRecord[]> {
      return deps.run(userId, async (tx) => {
        // `allStored`: exportação completa (LEG-D03). A estimativa desligada oculta o valor na tela, mas ele
        // continua guardado e é dado da pessoa (revisão M3 da 6a, ADR-0032).
        const showKcal = opts.allStored === true || (await estimateEnabled(tx, userId));
        const rows = await tx.mealEntry.findMany({
          where: { eatenAt: rangeBounds(range, deps.timeZone) },
          orderBy: { eatenAt: 'asc' },
        });
        return Promise.all(
          rows.map(async (r) => ({
            id: r.id,
            eatenAt: r.eatenAt.toISOString(),
            day: localDay(r.eatenAt, deps.timeZone),
            time: localTime(r.eatenAt, deps.timeZone),
            category: r.category,
            description:
              opts.withText && r.descriptionEnc
                ? await deps.cipher.open(userId, DESCRIPTION, r.descriptionEnc)
                : null,
            hunger: r.hunger,
            fullness: r.fullness,
            satisfaction: r.satisfaction,
            kcalEstimate: showKcal ? r.kcalEstimate : null,
            note:
              opts.withText && r.noteEnc ? await deps.cipher.open(userId, NOTE, r.noteEnc) : null,
          })),
        );
      });
    },

    async createMeal(userId: string, input: MealInput): Promise<MealWriteResult> {
      const eatenAt = instant(input);
      if (!eatenAt) return { ok: false, error: 'future' };
      return deps.run(userId, async (tx) => {
        const guard = checkCalorieEstimate(
          await estimateEnabled(tx, userId),
          input.kcalEstimate ?? null,
        );
        if (!guard.ok) return { ok: false, error: 'estimate_disabled' } as const;
        // Cifra só dentro da transação, depois da checagem de consentimento (regra 1).
        const row = await tx.mealEntry.create({
          data: { userId, eatenAt, ...values(input), ...(await sealed(userId, input)) },
          select: { id: true },
        });
        return { ok: true, id: row.id } as const;
      });
    },

    /**
     * Atualiza só se o registro for da pessoa (RLS); `null` = não encontrado. Com a estimativa desligada,
     * a caloria guardada antes é mantida (oculta), nunca sobrescrita por um formulário sem o campo.
     */
    async updateMeal(
      userId: string,
      id: string,
      input: MealInput,
    ): Promise<MealWriteResult | null> {
      const eatenAt = instant(input);
      if (!eatenAt) return { ok: false, error: 'future' };
      return deps.run(userId, async (tx) => {
        const enabled = await estimateEnabled(tx, userId);
        const guard = checkCalorieEstimate(enabled, input.kcalEstimate ?? null);
        if (!guard.ok) return { ok: false, error: 'estimate_disabled' } as const;
        const { kcalEstimate, ...rest } = values(input);
        const { count } = await tx.mealEntry.updateMany({
          where: { id },
          data: {
            eatenAt,
            ...rest,
            ...(enabled ? { kcalEstimate } : {}),
            ...(await sealed(userId, input)),
          },
        });
        return count === 1 ? ({ ok: true, id } as const) : null;
      });
    },

    async removeMeal(userId: string, id: string): Promise<boolean> {
      const { count } = await deps.run(userId, (tx) => tx.mealEntry.deleteMany({ where: { id } }));
      return count === 1;
    },

    async listWater(userId: string, range: DateRange): Promise<WaterRecord[]> {
      const rows = await deps.run(userId, (tx) =>
        tx.waterEntry.findMany({
          where: { day: { gte: isoToDbDate(range.from), lte: isoToDbDate(range.to) } },
          select: { id: true, day: true, ml: true },
          orderBy: [{ day: 'asc' }, { createdAt: 'asc' }],
        }),
      );
      return rows.map((r) => ({ id: r.id, day: dbDateToIso(r.day), ml: r.ml }));
    },

    async addWater(userId: string, input: WaterInput): Promise<WaterWriteResult> {
      const age = daysBetween(input.day, localDay(now(), deps.timeZone));
      if (age < 0 || age > WATER_BACKFILL_DAYS) return { ok: false, error: 'out_of_window' };
      const row = await deps.run(userId, (tx) =>
        tx.waterEntry.create({
          data: { userId, day: isoToDbDate(input.day), ml: input.ml },
          select: { id: true },
        }),
      );
      return { ok: true, id: row.id };
    },

    async removeWater(userId: string, id: string): Promise<boolean> {
      const { count } = await deps.run(userId, (tx) => tx.waterEntry.deleteMany({ where: { id } }));
      return count === 1;
    },

    /** Preferência da estimativa calórica, lida com consentimento (para a tela de Alimentação). */
    calorieEstimateEnabled(userId: string): Promise<boolean> {
      return deps.run(userId, (tx) => estimateEnabled(tx, userId));
    },
  };
}

export type NutritionService = ReturnType<typeof createNutritionService>;
