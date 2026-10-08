import { daysBetween, dbDateToIso, isoToDbDate, localDay } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import type { HealthDeps } from '@/modules/health/core';
import type { HabitInput } from './schemas';
import { CHECK_BACKFILL_DAYS, type HabitCheckRecord, type HabitRecord } from './types';

const NAME = { table: 'habits', column: 'name_enc' } as const;

export type CheckResult = 'ok' | 'not_found' | 'out_of_window';

/**
 * Hábitos e checks (§22). Acesso por `deps.run` (consentimento + RLS). O nome é cifrado (LEG-S02): pode
 * revelar dado de saúde. O check usa a FK composta (habit_id, user_id): nunca aponta para hábito alheio.
 */
export function createHabitsService(deps: HealthDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    async listHabits(
      userId: string,
      opts: { includeArchived?: boolean } = {},
    ): Promise<HabitRecord[]> {
      return deps.run(userId, async (tx) => {
        const rows = await tx.habit.findMany({
          where: opts.includeArchived ? {} : { archivedAt: null },
          orderBy: { createdAt: 'asc' },
        });
        return Promise.all(
          rows.map(async (r) => ({
            id: r.id,
            name: await deps.cipher.open(userId, NAME, r.nameEnc),
            frequency: r.frequency,
            weekdays: r.weekdays,
            timesPerWeek: r.timesPerWeek,
            archived: r.archivedAt !== null,
            createdDay: localDay(r.createdAt, deps.timeZone),
          })),
        );
      });
    },

    async listChecks(userId: string, range: DateRange): Promise<HabitCheckRecord[]> {
      const rows = await deps.run(userId, (tx) =>
        tx.habitCheck.findMany({
          where: { day: { gte: isoToDbDate(range.from), lte: isoToDbDate(range.to) } },
          select: { habitId: true, day: true },
          orderBy: { day: 'asc' },
        }),
      );
      return rows.map((r) => ({ habitId: r.habitId, day: dbDateToIso(r.day) }));
    },

    async create(userId: string, input: HabitInput): Promise<string> {
      // Cifra só dentro da transação, depois da checagem de consentimento (regra 1).
      const row = await deps.run(userId, async (tx) => {
        const nameEnc = await deps.cipher.seal(userId, NAME, input.name);
        return tx.habit.create({
          data: {
            userId,
            nameEnc,
            frequency: input.frequency,
            weekdays: input.weekdays,
            timesPerWeek: input.timesPerWeek,
          },
          select: { id: true },
        });
      });
      return row.id;
    },

    async update(userId: string, id: string, input: HabitInput): Promise<boolean> {
      // Cifra só dentro da transação, depois da checagem de consentimento (regra 1).
      const { count } = await deps.run(userId, async (tx) => {
        const nameEnc = await deps.cipher.seal(userId, NAME, input.name);
        return tx.habit.updateMany({
          where: { id },
          data: {
            nameEnc,
            frequency: input.frequency,
            weekdays: input.weekdays,
            timesPerWeek: input.timesPerWeek,
          },
        });
      });
      return count === 1;
    },

    /** Arquivar mantém o histórico de checks; reativar devolve o hábito à lista. */
    async setArchived(userId: string, id: string, archived: boolean): Promise<boolean> {
      const { count } = await deps.run(userId, (tx) =>
        tx.habit.updateMany({ where: { id }, data: { archivedAt: archived ? now() : null } }),
      );
      return count === 1;
    },

    /** Exclui o hábito e os checks (cascata). */
    async remove(userId: string, id: string): Promise<boolean> {
      const { count } = await deps.run(userId, (tx) => tx.habit.deleteMany({ where: { id } }));
      return count === 1;
    },

    async setCheck(
      userId: string,
      habitId: string,
      day: string,
      done: boolean,
    ): Promise<CheckResult> {
      const today = localDay(now(), deps.timeZone);
      const age = daysBetween(day, today);
      if (age < 0 || age > CHECK_BACKFILL_DAYS) return 'out_of_window';
      return deps.run(userId, async (tx) => {
        const habit = await tx.habit.findFirst({
          where: { id: habitId, archivedAt: null },
          select: { id: true },
        });
        if (!habit) return 'not_found';
        if (done) {
          await tx.habitCheck.createMany({
            data: [{ userId, habitId, day: isoToDbDate(day) }],
            skipDuplicates: true,
          });
        } else {
          await tx.habitCheck.deleteMany({ where: { habitId, day: isoToDbDate(day) } });
        }
        return 'ok';
      });
    },
  };
}

export type HabitsService = ReturnType<typeof createHabitsService>;
