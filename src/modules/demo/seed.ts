import type { FieldCipher, HealthRunner } from '@/modules/health/core';
import { isoToDbDate } from '@/lib/dates';
import type { DemoDataset } from './generator';

/**
 * Grava um conjunto SINTÉTICO (gerador da demo) na conta de uma pessoa fictícia, pelo mesmo caminho do
 * app: transação com consentimento (`run`) + RLS, texto livre cifrado. Só para desenvolvimento e testes
 * (CLAUDE.md regra 6): `scripts/seed-demo.ts` (recusa banco não local) e o setup do e2e.
 * Nunca usado pelo modo demo, que não grava nada (ADR-0021).
 */
export async function seedSyntheticData(deps: {
  run: HealthRunner;
  cipher: FieldCipher;
  userId: string;
  data: DemoDataset;
}): Promise<number> {
  const { run, cipher, userId, data } = deps;
  const seal = (table: string, column: string, text: string) =>
    cipher.seal(userId, { table, column }, text);

  const sleep = await Promise.all(
    data.sleep.map(async (r) => ({
      userId,
      bedAt: new Date(r.bedAt),
      wakeAt: new Date(r.wakeAt),
      quality: r.quality,
      awakenings: r.awakenings,
      noteEnc: r.note ? await seal('sleep_entries', 'note_enc', r.note) : null,
    })),
  );
  const habitNames = await Promise.all(data.habits.map((h) => seal('habits', 'name_enc', h.name)));
  const meals = await Promise.all(
    data.meals.map(async (r) => ({
      userId,
      eatenAt: new Date(r.eatenAt),
      category: r.category,
      descriptionEnc: r.description
        ? await seal('meal_entries', 'description_enc', r.description)
        : null,
      hunger: r.hunger,
      fullness: r.fullness,
      satisfaction: r.satisfaction,
      kcalEstimate: r.kcalEstimate,
      noteEnc: r.note ? await seal('meal_entries', 'note_enc', r.note) : null,
    })),
  );
  const activities = await Promise.all(
    data.activities.map(async (r) => ({
      entry: {
        userId,
        startedAt: new Date(r.startedAt),
        type: r.type,
        durationMin: r.durationMin,
        intensity: r.intensity,
        distanceKm: r.distanceKm,
        noteEnc: r.note ? await seal('activity_entries', 'note_enc', r.note) : null,
      },
      sets: await Promise.all(
        r.sets.map(async (x) => ({
          exerciseNameEnc: await seal('strength_sets', 'exercise_name_enc', x.exercise),
          setIndex: x.setIndex,
          reps: x.reps,
          loadKg: x.loadKg,
        })),
      ),
    })),
  );

  return run(userId, async (tx) => {
    let rows = 0;
    rows += (await tx.sleepEntry.createMany({ data: sleep })).count;
    rows += (
      await tx.bodyMeasurement.createMany({
        data: data.body.map((r) => ({
          userId,
          measuredAt: new Date(r.measuredAt),
          weightKg: r.weightKg,
          heightCm: r.heightCm,
          waistCm: r.waistCm,
          hipCm: r.hipCm,
          armCm: r.armCm,
          thighCm: r.thighCm,
          chestCm: r.chestCm,
          bodyFatPct: r.bodyFatPct,
        })),
      })
    ).count;
    const ids = new Map<string, string>();
    for (const [i, h] of data.habits.entries()) {
      const created = await tx.habit.create({
        data: {
          userId,
          nameEnc: habitNames[i] ?? new Uint8Array(),
          frequency: h.frequency,
          weekdays: h.weekdays,
          timesPerWeek: h.timesPerWeek,
          // Criado no primeiro dia do conjunto, para as métricas contarem o período inteiro.
          createdAt: new Date(`${h.createdDay}T12:00:00Z`),
        },
        select: { id: true },
      });
      ids.set(h.id, created.id);
      rows += 1;
    }
    rows += (
      await tx.habitCheck.createMany({
        data: data.checks.flatMap((c) => {
          const habitId = ids.get(c.habitId);
          return habitId ? [{ userId, habitId, day: isoToDbDate(c.day) }] : [];
        }),
      })
    ).count;
    rows += (await tx.mealEntry.createMany({ data: meals })).count;
    rows += (
      await tx.waterEntry.createMany({
        data: data.water.map((w) => ({ userId, day: isoToDbDate(w.day), ml: w.ml })),
      })
    ).count;
    for (const a of activities) {
      const created = await tx.activityEntry.create({ data: a.entry, select: { id: true } });
      rows += 1;
      if (a.sets.length > 0) {
        rows += (
          await tx.strengthSet.createMany({
            data: a.sets.map((x) => ({ ...x, userId, activityId: created.id })),
          })
        ).count;
      }
    }
    const habitRef = (habitId: string | null) => {
      const id = habitId === null ? undefined : ids.get(habitId);
      return id ? { habitId: id, habitUserId: userId } : { habitId: null, habitUserId: null };
    };
    rows += (
      await tx.goal.createMany({
        data: data.goals.map((g) => ({
          userId,
          domain: g.domain,
          metric: g.metric,
          targetValue: g.targetValue,
          startValue: g.startValue,
          ...habitRef(g.habitId),
          targetDay: g.targetDay === null ? null : isoToDbDate(g.targetDay),
          status: g.status,
          createdAt: new Date(`${g.createdDay}T12:00:00Z`),
        })),
      })
    ).count;
    rows += (
      await tx.reminder.createMany({
        data: data.reminders.map((r) => ({
          userId,
          kind: r.kind,
          ...habitRef(r.habitId),
          timeMin: r.timeMin,
          weekdays: r.weekdays,
          // Seed: lembretes guardados desligados; nada é enviado a contas sintéticas.
          enabled: false,
        })),
      })
    ).count;
    return rows;
  });
}
