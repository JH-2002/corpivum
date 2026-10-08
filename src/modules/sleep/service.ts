import { fromLocalDateTime, localDay, localTime, rangeBounds } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import type { HealthDeps } from '@/modules/health/core';
import { FUTURE_TOLERANCE_MS } from '@/modules/health/zod';
import { SLEEP_MAX_HOURS, type SleepInput } from './schemas';
import type { SleepRecord } from './types';

const NOTE = { table: 'sleep_entries', column: 'note_enc' } as const;

export type SleepWriteError = 'too_long' | 'future';
export type SleepWriteResult = { ok: true; id: string } | { ok: false; error: SleepWriteError };

/**
 * Sono (§20). Todo acesso passa por `deps.run` (consentimento + RLS). A nota é cifrada (LEG-S02).
 * Logs: nenhum conteúdo (o serviço não loga).
 */
export function createSleepService(deps: HealthDeps) {
  const now = deps.now ?? (() => new Date());

  function toInstants(input: SleepInput): { bedAt: Date; wakeAt: Date } | SleepWriteError {
    const bedAt = fromLocalDateTime(input.bedAt, deps.timeZone);
    const wakeAt = fromLocalDateTime(input.wakeAt, deps.timeZone);
    if (wakeAt.getTime() - bedAt.getTime() > SLEEP_MAX_HOURS * 3_600_000) return 'too_long';
    if (wakeAt.getTime() > now().getTime() + FUTURE_TOLERANCE_MS) return 'future';
    return { bedAt, wakeAt };
  }

  return {
    async list(
      userId: string,
      range: DateRange,
      opts: { withText?: boolean } = {},
    ): Promise<SleepRecord[]> {
      return deps.run(userId, async (tx) => {
        const rows = await tx.sleepEntry.findMany({
          where: { wakeAt: rangeBounds(range, deps.timeZone) },
          orderBy: { wakeAt: 'asc' },
        });
        return Promise.all(
          rows.map(async (r) => ({
            id: r.id,
            bedAt: r.bedAt.toISOString(),
            wakeAt: r.wakeAt.toISOString(),
            day: localDay(r.wakeAt, deps.timeZone),
            bedTime: localTime(r.bedAt, deps.timeZone),
            wakeTime: localTime(r.wakeAt, deps.timeZone),
            quality: r.quality,
            awakenings: r.awakenings,
            note:
              opts.withText && r.noteEnc ? await deps.cipher.open(userId, NOTE, r.noteEnc) : null,
          })),
        );
      });
    },

    async create(userId: string, input: SleepInput): Promise<SleepWriteResult> {
      const instants = toInstants(input);
      if (typeof instants === 'string') return { ok: false, error: instants };
      // Cifra só dentro da transação, depois da checagem de consentimento (regra 1).
      const row = await deps.run(userId, async (tx) => {
        const noteEnc = input.note ? await deps.cipher.seal(userId, NOTE, input.note) : null;
        return tx.sleepEntry.create({
          data: {
            userId,
            ...instants,
            quality: input.quality ?? null,
            awakenings: input.awakenings ?? null,
            noteEnc,
          },
          select: { id: true },
        });
      });
      return { ok: true, id: row.id };
    },

    /** Atualiza só se o registro for da pessoa (RLS); `null` = não encontrado. */
    async update(userId: string, id: string, input: SleepInput): Promise<SleepWriteResult | null> {
      const instants = toInstants(input);
      if (typeof instants === 'string') return { ok: false, error: instants };
      // Cifra só dentro da transação, depois da checagem de consentimento (regra 1).
      const { count } = await deps.run(userId, async (tx) => {
        const noteEnc = input.note ? await deps.cipher.seal(userId, NOTE, input.note) : null;
        return tx.sleepEntry.updateMany({
          where: { id },
          data: {
            ...instants,
            quality: input.quality ?? null,
            awakenings: input.awakenings ?? null,
            noteEnc,
          },
        });
      });
      return count === 1 ? { ok: true, id } : null;
    },

    async remove(userId: string, id: string): Promise<boolean> {
      const { count } = await deps.run(userId, (tx) => tx.sleepEntry.deleteMany({ where: { id } }));
      return count === 1;
    },
  };
}

export type SleepService = ReturnType<typeof createSleepService>;
