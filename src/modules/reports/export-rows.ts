import { z } from 'zod';
import { localDay, localTime } from '@/lib/dates';
import type { FieldCipher, FieldRef } from '@/modules/health/core';
import type { HealthRecords } from './dataset';

/**
 * Registros de saúde lidos pelo caminho RESTRITO da exportação completa (`app.export_job_health_data`, OI-32,
 * ADR-0032): o banco devolve as linhas da própria pessoa em JSON (snake_case, bytea em hex) e aqui elas viram os
 * mesmos registros que os serviços das telas produzem, com a mesma cifra (contexto `{ userId, tabela, coluna }`).
 * Um teste de banco compara os dois caminhos. Só a exportação usa isto; as telas seguem pelos serviços.
 */
const NOTE_SLEEP: FieldRef = { table: 'sleep_entries', column: 'note_enc' };
const HABIT_NAME: FieldRef = { table: 'habits', column: 'name_enc' };
const MEAL_DESCRIPTION: FieldRef = { table: 'meal_entries', column: 'description_enc' };
const MEAL_NOTE: FieldRef = { table: 'meal_entries', column: 'note_enc' };
const ACTIVITY_NOTE: FieldRef = { table: 'activity_entries', column: 'note_enc' };
const EXERCISE: FieldRef = { table: 'strength_sets', column: 'exercise_name_enc' };

const instant = z.string().transform((s) => new Date(s));
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bytes = z
  .string()
  .regex(/^\\x[0-9a-f]*$/i)
  .transform((s) => Uint8Array.from(Buffer.from(s.slice(2), 'hex')));
const int = z.number().int();
const num = z.number();

const rowsSchema = z.object({
  sleep: z.array(
    z.object({
      id: z.uuid(),
      bed_at: instant,
      wake_at: instant,
      quality: int.nullable(),
      awakenings: int.nullable(),
      note_enc: bytes.nullable(),
    }),
  ),
  habits: z.array(
    z.object({
      id: z.uuid(),
      name_enc: bytes,
      frequency: z.enum(['daily', 'weekdays', 'times_per_week']),
      weekdays: z.array(int),
      times_per_week: int.nullable(),
      archived_at: instant.nullable(),
      created_at: instant,
    }),
  ),
  habit_checks: z.array(z.object({ habit_id: z.uuid(), day })),
  body: z.array(
    z.object({
      id: z.uuid(),
      measured_at: instant,
      weight_kg: num.nullable(),
      height_cm: num.nullable(),
      waist_cm: num.nullable(),
      hip_cm: num.nullable(),
      arm_cm: num.nullable(),
      thigh_cm: num.nullable(),
      chest_cm: num.nullable(),
      body_fat_pct: num.nullable(),
    }),
  ),
  meals: z.array(
    z.object({
      id: z.uuid(),
      eaten_at: instant,
      category: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']),
      description_enc: bytes.nullable(),
      hunger: int.nullable(),
      fullness: int.nullable(),
      satisfaction: int.nullable(),
      kcal_estimate: int.nullable(),
      note_enc: bytes.nullable(),
    }),
  ),
  water: z.array(z.object({ id: z.uuid(), day, ml: int })),
  activities: z.array(
    z.object({
      id: z.uuid(),
      started_at: instant,
      type: z.enum([
        'walking',
        'running',
        'cycling',
        'swimming',
        'strength',
        'stretching',
        'dance',
        'sport',
        'other',
      ]),
      duration_min: int,
      intensity: int.nullable(),
      distance_km: num.nullable(),
      note_enc: bytes.nullable(),
    }),
  ),
  strength_sets: z.array(
    z.object({
      activity_id: z.uuid(),
      exercise_name_enc: bytes,
      set_index: int,
      reps: int,
      load_kg: num.nullable(),
    }),
  ),
  goals: z.array(
    z.object({
      id: z.uuid(),
      domain: z.enum(['sleep', 'activity', 'habits', 'weight', 'logging', 'nutrition']),
      metric: z.enum([
        'sleep_avg_minutes',
        'activity_minutes_week',
        'activity_sessions_week',
        'habit_completion_pct',
        'weight_kg',
        'logging_days_week',
        'kcal_reference_day',
      ]),
      target_value: num,
      start_value: num.nullable(),
      habit_id: z.uuid().nullable(),
      target_day: day.nullable(),
      status: z.enum(['active', 'archived']),
      created_at: instant,
    }),
  ),
  reminders: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(['habit', 'daily_log']),
      habit_id: z.uuid().nullable(),
      time_min: int,
      weekdays: z.array(int),
      enabled: z.boolean(),
    }),
  ),
});

export async function exportRecordsFromRows(
  raw: unknown,
  ctx: { userId: string; cipher: FieldCipher; timeZone: string },
): Promise<HealthRecords> {
  const r = rowsSchema.parse(raw);
  const { userId, cipher, timeZone: tz } = ctx;
  const open = (field: FieldRef, blob: Uint8Array | null) =>
    blob ? cipher.open(userId, field, blob) : Promise.resolve(null);

  const setsByActivity = new Map<string, (typeof r.strength_sets)[number][]>();
  for (const s of r.strength_sets) {
    const list = setsByActivity.get(s.activity_id) ?? [];
    list.push(s);
    setsByActivity.set(s.activity_id, list);
  }

  return {
    sleep: await Promise.all(
      r.sleep.map(async (s) => ({
        id: s.id,
        bedAt: s.bed_at.toISOString(),
        wakeAt: s.wake_at.toISOString(),
        day: localDay(s.wake_at, tz),
        bedTime: localTime(s.bed_at, tz),
        wakeTime: localTime(s.wake_at, tz),
        quality: s.quality,
        awakenings: s.awakenings,
        note: await open(NOTE_SLEEP, s.note_enc),
      })),
    ),
    habits: await Promise.all(
      r.habits.map(async (h) => ({
        id: h.id,
        name: await cipher.open(userId, HABIT_NAME, h.name_enc),
        frequency: h.frequency,
        weekdays: h.weekdays,
        timesPerWeek: h.times_per_week,
        archived: h.archived_at !== null,
        createdDay: localDay(h.created_at, tz),
      })),
    ),
    checks: r.habit_checks.map((c) => ({ habitId: c.habit_id, day: c.day })),
    body: r.body.map((b) => ({
      id: b.id,
      measuredAt: b.measured_at.toISOString(),
      day: localDay(b.measured_at, tz),
      weightKg: b.weight_kg,
      heightCm: b.height_cm,
      waistCm: b.waist_cm,
      hipCm: b.hip_cm,
      armCm: b.arm_cm,
      thighCm: b.thigh_cm,
      chestCm: b.chest_cm,
      bodyFatPct: b.body_fat_pct,
    })),
    meals: await Promise.all(
      r.meals.map(async (m) => ({
        id: m.id,
        eatenAt: m.eaten_at.toISOString(),
        day: localDay(m.eaten_at, tz),
        time: localTime(m.eaten_at, tz),
        category: m.category,
        description: await open(MEAL_DESCRIPTION, m.description_enc),
        hunger: m.hunger,
        fullness: m.fullness,
        satisfaction: m.satisfaction,
        // Valor guardado, mesmo com a estimativa desligada (exportação completa, revisão M3).
        kcalEstimate: m.kcal_estimate,
        note: await open(MEAL_NOTE, m.note_enc),
      })),
    ),
    water: r.water.map((w) => ({ id: w.id, day: w.day, ml: w.ml })),
    activities: await Promise.all(
      r.activities.map(async (a) => ({
        id: a.id,
        startedAt: a.started_at.toISOString(),
        day: localDay(a.started_at, tz),
        time: localTime(a.started_at, tz),
        type: a.type,
        durationMin: a.duration_min,
        intensity: a.intensity,
        distanceKm: a.distance_km,
        note: await open(ACTIVITY_NOTE, a.note_enc),
        sets: await Promise.all(
          (setsByActivity.get(a.id) ?? []).map(async (s) => ({
            exercise: await cipher.open(userId, EXERCISE, s.exercise_name_enc),
            setIndex: s.set_index,
            reps: s.reps,
            loadKg: s.load_kg,
          })),
        ),
      })),
    ),
    goals: r.goals.map((g) => ({
      id: g.id,
      domain: g.domain,
      metric: g.metric,
      targetValue: g.target_value,
      startValue: g.start_value,
      habitId: g.habit_id,
      targetDay: g.target_day,
      status: g.status,
      createdDay: localDay(g.created_at, tz),
    })),
    reminders: r.reminders.map((m) => ({
      id: m.id,
      kind: m.kind,
      habitId: m.habit_id,
      timeMin: m.time_min,
      weekdays: m.weekdays,
      enabled: m.enabled,
    })),
  };
}
