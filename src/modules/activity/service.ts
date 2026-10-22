import { fromLocalDateTime, localDay, localTime, rangeBounds } from '@/lib/dates';
import type { Tx } from '@/lib/db';
import type { DateRange } from '@/lib/period';
import type { HealthDeps } from '@/modules/health/core';
import { FUTURE_TOLERANCE_MS } from '@/modules/health/zod';
import type { ActivityInput } from './schemas';
import type { ActivityRecord } from './types';

const NOTE = { table: 'activity_entries', column: 'note_enc' } as const;
const EXERCISE = { table: 'strength_sets', column: 'exercise_name_enc' } as const;

export type ActivityWriteResult = { ok: true; id: string } | { ok: false; error: 'future' };

/**
 * Atividade física (§26, LEG-M08). Registra e descreve; nunca sugere carga, série ou treino. Acesso por
 * `deps.run` (consentimento + RLS). Nota e nome do exercício cifrados (LEG-S02): o nome pode revelar dado
 * de saúde (ex.: reabilitação). A progressão agrupa por nome depois de decifrar, em memória. Sem calorias
 * gastas. O serviço não loga.
 */
export function createActivityService(deps: HealthDeps) {
  const now = deps.now ?? (() => new Date());

  function instant(input: ActivityInput): Date | null {
    const at = fromLocalDateTime(input.startedAt, deps.timeZone);
    return at.getTime() > now().getTime() + FUTURE_TOLERANCE_MS ? null : at;
  }

  function values(input: ActivityInput) {
    return {
      type: input.type,
      durationMin: input.durationMin,
      intensity: input.intensity ?? null,
      distanceKm: input.distanceKm ?? null,
    };
  }

  async function writeSets(tx: Tx, userId: string, activityId: string, input: ActivityInput) {
    if (input.sets.length === 0) return;
    const data = await Promise.all(
      input.sets.map(async (s, i) => ({
        userId,
        activityId,
        exerciseNameEnc: await deps.cipher.seal(userId, EXERCISE, s.exercise),
        setIndex: i + 1,
        reps: s.reps,
        loadKg: s.loadKg ?? null,
      })),
    );
    await tx.strengthSet.createMany({ data });
  }

  return {
    async list(
      userId: string,
      range: DateRange,
      opts: { withText?: boolean } = {},
    ): Promise<ActivityRecord[]> {
      return deps.run(userId, async (tx) => {
        const rows = await tx.activityEntry.findMany({
          where: { startedAt: rangeBounds(range, deps.timeZone) },
          orderBy: { startedAt: 'asc' },
          include: { sets: { orderBy: { setIndex: 'asc' } } },
        });
        return Promise.all(
          rows.map(async (r) => ({
            id: r.id,
            startedAt: r.startedAt.toISOString(),
            day: localDay(r.startedAt, deps.timeZone),
            time: localTime(r.startedAt, deps.timeZone),
            type: r.type,
            durationMin: r.durationMin,
            intensity: r.intensity,
            distanceKm: r.distanceKm,
            note:
              opts.withText && r.noteEnc ? await deps.cipher.open(userId, NOTE, r.noteEnc) : null,
            sets: await Promise.all(
              r.sets.map(async (s) => ({
                exercise: await deps.cipher.open(userId, EXERCISE, s.exerciseNameEnc),
                setIndex: s.setIndex,
                reps: s.reps,
                loadKg: s.loadKg,
              })),
            ),
          })),
        );
      });
    },

    /**
     * Só os dias com atividade registrada (Índice, ADR-0050): lê apenas o horário de início, sem séries, notas
     * nem decifrar nada (minimização).
     */
    async days(userId: string, range: DateRange): Promise<string[]> {
      return deps.run(userId, async (tx) => {
        const rows = await tx.activityEntry.findMany({
          where: { startedAt: rangeBounds(range, deps.timeZone) },
          select: { startedAt: true },
        });
        return [...new Set(rows.map((r) => localDay(r.startedAt, deps.timeZone)))].sort();
      });
    },

    async create(userId: string, input: ActivityInput): Promise<ActivityWriteResult> {
      const startedAt = instant(input);
      if (!startedAt) return { ok: false, error: 'future' };
      // Cifra só dentro da transação, depois da checagem de consentimento (regra 1).
      const id = await deps.run(userId, async (tx) => {
        const noteEnc = input.note ? await deps.cipher.seal(userId, NOTE, input.note) : null;
        const row = await tx.activityEntry.create({
          data: { userId, startedAt, ...values(input), noteEnc },
          select: { id: true },
        });
        await writeSets(tx, userId, row.id, input);
        return row.id;
      });
      return { ok: true, id };
    },

    /** Atualiza só se o registro for da pessoa (RLS); as séries são substituídas. `null` = não encontrado. */
    async update(
      userId: string,
      id: string,
      input: ActivityInput,
    ): Promise<ActivityWriteResult | null> {
      const startedAt = instant(input);
      if (!startedAt) return { ok: false, error: 'future' };
      const found = await deps.run(userId, async (tx) => {
        const noteEnc = input.note ? await deps.cipher.seal(userId, NOTE, input.note) : null;
        const { count } = await tx.activityEntry.updateMany({
          where: { id },
          data: { startedAt, ...values(input), noteEnc },
        });
        if (count !== 1) return false;
        await tx.strengthSet.deleteMany({ where: { activityId: id } });
        await writeSets(tx, userId, id, input);
        return true;
      });
      return found ? { ok: true, id } : null;
    },

    /** Exclui a atividade e as séries (cascata). */
    async remove(userId: string, id: string): Promise<boolean> {
      const { count } = await deps.run(userId, (tx) =>
        tx.activityEntry.deleteMany({ where: { id } }),
      );
      return count === 1;
    },
  };
}

export type ActivityService = ReturnType<typeof createActivityService>;
