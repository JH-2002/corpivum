import { fromLocalDateTime, localDay, rangeBounds } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import type { HealthDeps } from '@/modules/health/core';
import { FUTURE_TOLERANCE_MS } from '@/modules/health/zod';
import type { BodyInput } from './schemas';
import { BODY_FIELDS, type BodyField, type BodyRecord } from './types';

export type BodyWriteResult = { ok: true; id: string } | { ok: false; error: 'future' };

function values(input: BodyInput): Record<BodyField, number | null> {
  return Object.fromEntries(BODY_FIELDS.map((f) => [f, input[f] ?? null])) as Record<
    BodyField,
    number | null
  >;
}

/** Peso e medidas (§23). Acesso por `deps.run` (consentimento + RLS). Sem texto livre. */
export function createBodyService(deps: HealthDeps) {
  const now = deps.now ?? (() => new Date());

  function instant(input: BodyInput): Date | null {
    const at = fromLocalDateTime(input.measuredAt, deps.timeZone);
    return at.getTime() > now().getTime() + FUTURE_TOLERANCE_MS ? null : at;
  }

  return {
    async list(userId: string, range: DateRange): Promise<BodyRecord[]> {
      const rows = await deps.run(userId, (tx) =>
        tx.bodyMeasurement.findMany({
          where: { measuredAt: rangeBounds(range, deps.timeZone) },
          orderBy: { measuredAt: 'asc' },
        }),
      );
      return rows.map((r) => ({
        id: r.id,
        measuredAt: r.measuredAt.toISOString(),
        day: localDay(r.measuredAt, deps.timeZone),
        ...Object.fromEntries(BODY_FIELDS.map((f) => [f, r[f]])),
      })) as BodyRecord[];
    },

    /** Altura mais recente informada (para o IMC), de qualquer data. */
    async latestHeightCm(userId: string): Promise<number | null> {
      const row = await deps.run(userId, (tx) =>
        tx.bodyMeasurement.findFirst({
          where: { heightCm: { not: null } },
          orderBy: { measuredAt: 'desc' },
          select: { heightCm: true },
        }),
      );
      return row?.heightCm ?? null;
    },

    async create(userId: string, input: BodyInput): Promise<BodyWriteResult> {
      const measuredAt = instant(input);
      if (!measuredAt) return { ok: false, error: 'future' };
      const row = await deps.run(userId, (tx) =>
        tx.bodyMeasurement.create({
          data: { userId, measuredAt, ...values(input) },
          select: { id: true },
        }),
      );
      return { ok: true, id: row.id };
    },

    async update(userId: string, id: string, input: BodyInput): Promise<BodyWriteResult | null> {
      const measuredAt = instant(input);
      if (!measuredAt) return { ok: false, error: 'future' };
      const { count } = await deps.run(userId, (tx) =>
        tx.bodyMeasurement.updateMany({ where: { id }, data: { measuredAt, ...values(input) } }),
      );
      return count === 1 ? { ok: true, id } : null;
    },

    async remove(userId: string, id: string): Promise<boolean> {
      const { count } = await deps.run(userId, (tx) =>
        tx.bodyMeasurement.deleteMany({ where: { id } }),
      );
      return count === 1;
    },
  };
}

export type BodyService = ReturnType<typeof createBodyService>;
