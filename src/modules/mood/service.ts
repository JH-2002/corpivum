import { fromLocalDateTime, localDay, rangeBounds } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import type { HealthDeps } from '@/modules/health/core';
import { FUTURE_TOLERANCE_MS } from '@/modules/health/zod';
import type { MoodInput } from './schemas';
import type { MoodRecord } from './types';

const NOTE = { table: 'mood_entries', column: 'note_enc' } as const;

export type MoodWriteResult = { ok: true; id: string } | { ok: false; error: 'future' };

/** Humor, energia e estresse (§21). Acesso por `deps.run` (consentimento + RLS); nota cifrada (LEG-S02). */
export function createMoodService(deps: HealthDeps) {
  const now = deps.now ?? (() => new Date());

  function instant(input: MoodInput): Date | null {
    const at = fromLocalDateTime(input.loggedAt, deps.timeZone);
    return at.getTime() > now().getTime() + FUTURE_TOLERANCE_MS ? null : at;
  }

  return {
    async list(
      userId: string,
      range: DateRange,
      opts: { withText?: boolean } = {},
    ): Promise<MoodRecord[]> {
      return deps.run(userId, async (tx) => {
        const rows = await tx.moodEntry.findMany({
          where: { loggedAt: rangeBounds(range, deps.timeZone) },
          orderBy: { loggedAt: 'asc' },
        });
        return Promise.all(
          rows.map(async (r) => ({
            id: r.id,
            loggedAt: r.loggedAt.toISOString(),
            day: localDay(r.loggedAt, deps.timeZone),
            mood: r.mood,
            energy: r.energy,
            stress: r.stress,
            emotions: r.emotions,
            note:
              opts.withText && r.noteEnc ? await deps.cipher.open(userId, NOTE, r.noteEnc) : null,
          })),
        );
      });
    },

    async create(userId: string, input: MoodInput): Promise<MoodWriteResult> {
      const loggedAt = instant(input);
      if (!loggedAt) return { ok: false, error: 'future' };
      const noteEnc = input.note ? await deps.cipher.seal(userId, NOTE, input.note) : null;
      const row = await deps.run(userId, (tx) =>
        tx.moodEntry.create({
          data: {
            userId,
            loggedAt,
            mood: input.mood,
            energy: input.energy,
            stress: input.stress,
            emotions: input.emotions,
            noteEnc,
          },
          select: { id: true },
        }),
      );
      return { ok: true, id: row.id };
    },

    async update(userId: string, id: string, input: MoodInput): Promise<MoodWriteResult | null> {
      const loggedAt = instant(input);
      if (!loggedAt) return { ok: false, error: 'future' };
      const noteEnc = input.note ? await deps.cipher.seal(userId, NOTE, input.note) : null;
      const { count } = await deps.run(userId, (tx) =>
        tx.moodEntry.updateMany({
          where: { id },
          data: {
            loggedAt,
            mood: input.mood,
            energy: input.energy,
            stress: input.stress,
            emotions: input.emotions,
            noteEnc,
          },
        }),
      );
      return count === 1 ? { ok: true, id } : null;
    },

    async remove(userId: string, id: string): Promise<boolean> {
      const { count } = await deps.run(userId, (tx) => tx.moodEntry.deleteMany({ where: { id } }));
      return count === 1;
    },
  };
}

export type MoodService = ReturnType<typeof createMoodService>;
