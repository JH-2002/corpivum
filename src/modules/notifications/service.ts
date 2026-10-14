import { isoToDbDate } from '@/lib/dates';
import type { Tx } from '@/lib/db';
import type { HealthDeps } from '@/modules/health/core';
import type { ReminderInput } from './schemas';
import { MAX_REMINDERS, type ReminderPrefs, type ReminderRecord } from './types';

export type ReminderWriteResult =
  { ok: true; reminder: ReminderRecord } | { ok: false; error: 'habit_not_found' | 'too_many' };

const toRecord = (r: {
  id: string;
  kind: ReminderRecord['kind'];
  habitId: string | null;
  timeMin: number;
  weekdays: number[];
  enabled: boolean;
}): ReminderRecord => ({
  id: r.id,
  kind: r.kind,
  habitId: r.habitId,
  timeMin: r.timeMin,
  weekdays: r.weekdays,
  enabled: r.enabled,
});

const SELECT = {
  id: true,
  kind: true,
  habitId: true,
  timeMin: true,
  weekdays: true,
  enabled: true,
} as const;

function readPrefs(tx: Tx, userId: string): Promise<(ReminderPrefs & { email: string }) | null> {
  // Conta excluída (exclusão lógica, Fase 6) não recebe nada (LEG-D04, revisão B7).
  return tx.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      email: true,
      remindHabits: true,
      remindDailyLog: true,
      quietStartMin: true,
      quietEndMin: true,
    },
  });
}

/**
 * Lembretes (§33, LEG-F05). Tabela de saúde (o lembrete aponta para um hábito): acesso por `deps.run`
 * (consentimento + RLS). Revogar o consentimento interrompe os envios. O serviço não loga.
 */
export function createRemindersService(deps: HealthDeps) {
  async function habitOk(tx: Tx, habitId: string | null): Promise<boolean> {
    if (habitId === null) return true;
    const habit = await tx.habit.findFirst({
      where: { id: habitId, archivedAt: null },
      select: { id: true },
    });
    return habit !== null;
  }

  return {
    async list(userId: string): Promise<ReminderRecord[]> {
      const rows = await deps.run(userId, (tx) =>
        tx.reminder.findMany({
          select: SELECT,
          orderBy: [{ timeMin: 'asc' }, { createdAt: 'asc' }],
        }),
      );
      return rows.map(toRecord);
    },

    async prefs(userId: string): Promise<ReminderPrefs> {
      const p = await deps.run(userId, (tx) => readPrefs(tx, userId));
      return {
        remindHabits: p?.remindHabits ?? true,
        remindDailyLog: p?.remindDailyLog ?? true,
        quietStartMin: p?.quietStartMin ?? null,
        quietEndMin: p?.quietEndMin ?? null,
      };
    },

    async create(userId: string, input: ReminderInput): Promise<ReminderWriteResult> {
      return deps.run(userId, async (tx) => {
        // Serializa por pessoa: duas requisições simultâneas não passam do limite (revisão B6).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('reminders:' || ${userId}, 0))`;
        if ((await tx.reminder.count()) >= MAX_REMINDERS) {
          return { ok: false, error: 'too_many' } as const;
        }
        if (!(await habitOk(tx, input.habitId)))
          return { ok: false, error: 'habit_not_found' } as const;
        const row = await tx.reminder.create({
          data: {
            userId,
            kind: input.kind,
            habitId: input.habitId,
            habitUserId: input.habitId === null ? null : userId,
            timeMin: input.timeMin,
            weekdays: input.weekdays,
          },
          select: SELECT,
        });
        return { ok: true, reminder: toRecord(row) } as const;
      });
    },

    async update(
      userId: string,
      id: string,
      input: ReminderInput,
    ): Promise<ReminderWriteResult | null> {
      return deps.run(userId, async (tx) => {
        if (!(await habitOk(tx, input.habitId)))
          return { ok: false, error: 'habit_not_found' } as const;
        const { count } = await tx.reminder.updateMany({
          where: { id },
          data: {
            kind: input.kind,
            habitId: input.habitId,
            habitUserId: input.habitId === null ? null : userId,
            timeMin: input.timeMin,
            weekdays: input.weekdays,
          },
        });
        if (count !== 1) return null;
        const row = await tx.reminder.findFirstOrThrow({ where: { id }, select: SELECT });
        return { ok: true, reminder: toRecord(row) } as const;
      });
    },

    async setEnabled(userId: string, id: string, enabled: boolean): Promise<ReminderRecord | null> {
      return deps.run(userId, async (tx) => {
        const { count } = await tx.reminder.updateMany({ where: { id }, data: { enabled } });
        if (count !== 1) return null;
        return toRecord(await tx.reminder.findFirstOrThrow({ where: { id }, select: SELECT }));
      });
    },

    async remove(userId: string, id: string): Promise<boolean> {
      const { count } = await deps.run(userId, (tx) => tx.reminder.deleteMany({ where: { id } }));
      return count === 1;
    },

    /** Tudo o que o job precisa para decidir o envio. `null` = o lembrete não existe mais. */
    async dispatchContext(
      userId: string,
      id: string,
    ): Promise<{
      reminder: ReminderRecord;
      prefs: ReminderPrefs;
      email: string;
      /** Hábito ativo (lembrete de registro: sempre). Arquivado = a cadeia continua, sem enviar. */
      habitActive: boolean;
    } | null> {
      return deps.run(userId, async (tx) => {
        const row = await tx.reminder.findFirst({ where: { id }, select: SELECT });
        const user = await readPrefs(tx, userId);
        if (!row || !user) return null;
        const habitActive = await habitOk(tx, row.habitId);
        const { email, ...prefs } = user;
        return { reminder: toRecord(row), prefs, email, habitActive };
      });
    },

    /**
     * Reserva o envio do dia: só uma execução por lembrete e por dia consegue (UPDATE condicional). É o que
     * garante "no máximo um e-mail por lembrete por dia", mesmo com job repetido ou duas instâncias.
     */
    async claimSend(userId: string, id: string, day: string): Promise<boolean> {
      const date = isoToDbDate(day);
      const { count } = await deps.run(userId, (tx) =>
        tx.reminder.updateMany({
          where: { id, enabled: true, OR: [{ lastSentDay: null }, { lastSentDay: { lt: date } }] },
          data: { lastSentDay: date },
        }),
      );
      return count === 1;
    },
  };
}

export type RemindersService = ReturnType<typeof createRemindersService>;
