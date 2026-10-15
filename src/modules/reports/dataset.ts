import type { ActivityRecord } from '@/modules/activity';
import { BODY_FIELDS, type BodyRecord } from '@/modules/body';
import type { GoalRecord } from '@/modules/goals';
import type { HabitCheckRecord, HabitRecord } from '@/modules/habits';
import type { ReminderRecord } from '@/modules/notifications';
import type { MealRecord, WaterRecord } from '@/modules/nutrition';
import type { SleepRecord } from '@/modules/sleep';

/**
 * Conjunto da exportação completa (portabilidade, LEG-D03, ADR-0032). Cada tabela tem uma lista FECHADA de
 * colunas, copiadas campo a campo do registro: nada de espalhar o objeto inteiro, para que um campo novo ou
 * um valor só interno (IMC, relação cintura/quadril, `internal.ts`) nunca saia por acidente.
 */
export type Cell = string | number | boolean | null;

export interface ExportTable {
  /** Nome estável (arquivo CSV e chave do JSON). */
  name: ExportTableName;
  /** Selo do dado (CLAUDE.md regra 7): tudo aqui foi registrado pela pessoa. */
  badge: 'INFORMADO';
  columns: readonly string[];
  /** Unidade por coluna, quando houver. */
  units: Readonly<Record<string, string>>;
  rows: Cell[][];
}

export const EXPORT_TABLES = [
  'sleep',
  'habits',
  'habit_checks',
  'body_measurements',
  'meals',
  'water',
  'activities',
  'strength_sets',
  'goals',
  'reminders',
] as const;
export type ExportTableName = (typeof EXPORT_TABLES)[number];

export interface HealthRecords {
  sleep: SleepRecord[];
  habits: HabitRecord[];
  checks: HabitCheckRecord[];
  body: BodyRecord[];
  meals: MealRecord[];
  water: WaterRecord[];
  activities: ActivityRecord[];
  goals: GoalRecord[];
  reminders: ReminderRecord[];
}

/** Dados da conta (não são de saúde): só o que a pessoa vê ou escolheu, sem hashes, tokens nem segredos. */
export interface AccountExport {
  email: string;
  createdAt: string;
  emailVerifiedAt: string | null;
  mfaEnabled: boolean;
  dataMode: string | null;
  preferences: {
    streaksEnabled: boolean;
    calorieEstimateEnabled: boolean;
    remindHabits: boolean;
    remindDailyLog: boolean;
    quietStartMin: number | null;
    quietEndMin: number | null;
  };
  consents: {
    purpose: string;
    policyVersion: number;
    grantedAt: string;
    revokedAt: string | null;
  }[];
  documents: { document: string; version: number; kind: string; at: string }[];
  privacyRequests: {
    kind: string;
    status: string;
    createdAt: string;
    dueAt: string;
    closedAt: string | null;
  }[];
}

type Spec<R> = {
  columns: readonly string[];
  units?: Record<string, string>;
  row: (r: R) => Cell[];
};

const table = <R>(name: ExportTableName, spec: Spec<R>, records: readonly R[]): ExportTable => ({
  name,
  badge: 'INFORMADO',
  columns: spec.columns,
  units: spec.units ?? {},
  rows: records.map(spec.row),
});

const BODY_UNITS: Record<string, string> = {
  weightKg: 'kg',
  heightCm: 'cm',
  waistCm: 'cm',
  hipCm: 'cm',
  armCm: 'cm',
  thighCm: 'cm',
  chestCm: 'cm',
  bodyFatPct: '%',
};

const weekdays = (days: readonly number[]) => days.join(',');

export function exportTables(r: HealthRecords): ExportTable[] {
  return [
    table(
      'sleep',
      {
        columns: ['day', 'bedAt', 'wakeAt', 'bedTime', 'wakeTime', 'quality', 'awakenings', 'note'],
        units: { quality: '1-5' },
        row: (s: SleepRecord) => [
          s.day,
          s.bedAt,
          s.wakeAt,
          s.bedTime,
          s.wakeTime,
          s.quality,
          s.awakenings,
          s.note,
        ],
      },
      r.sleep,
    ),
    table(
      'habits',
      {
        columns: ['id', 'name', 'frequency', 'weekdays', 'timesPerWeek', 'archived', 'createdDay'],
        row: (h: HabitRecord) => [
          h.id,
          h.name,
          h.frequency,
          weekdays(h.weekdays),
          h.timesPerWeek,
          h.archived,
          h.createdDay,
        ],
      },
      r.habits,
    ),
    table(
      'habit_checks',
      { columns: ['habitId', 'day'], row: (c: HabitCheckRecord) => [c.habitId, c.day] },
      r.checks,
    ),
    table(
      'body_measurements',
      {
        columns: ['day', 'measuredAt', ...BODY_FIELDS],
        units: BODY_UNITS,
        row: (b: BodyRecord) => [b.day, b.measuredAt, ...BODY_FIELDS.map((f) => b[f])],
      },
      r.body,
    ),
    table(
      'meals',
      {
        columns: [
          'day',
          'time',
          'eatenAt',
          'category',
          'description',
          'hunger',
          'fullness',
          'satisfaction',
          'kcalEstimate',
          'note',
        ],
        units: { hunger: '1-5', fullness: '1-5', satisfaction: '1-5', kcalEstimate: 'kcal' },
        row: (m: MealRecord) => [
          m.day,
          m.time,
          m.eatenAt,
          m.category,
          m.description,
          m.hunger,
          m.fullness,
          m.satisfaction,
          m.kcalEstimate,
          m.note,
        ],
      },
      r.meals,
    ),
    table(
      'water',
      { columns: ['day', 'ml'], units: { ml: 'ml' }, row: (w: WaterRecord) => [w.day, w.ml] },
      r.water,
    ),
    table(
      'activities',
      {
        columns: [
          'id',
          'day',
          'time',
          'startedAt',
          'type',
          'durationMin',
          'intensity',
          'distanceKm',
          'note',
        ],
        units: { durationMin: 'min', intensity: '1-10', distanceKm: 'km' },
        row: (a: ActivityRecord) => [
          a.id,
          a.day,
          a.time,
          a.startedAt,
          a.type,
          a.durationMin,
          a.intensity,
          a.distanceKm,
          a.note,
        ],
      },
      r.activities,
    ),
    table(
      'strength_sets',
      {
        columns: ['activityId', 'exercise', 'setIndex', 'reps', 'loadKg'],
        units: { loadKg: 'kg' },
        row: (s: { activityId: string } & ActivityRecord['sets'][number]) => [
          s.activityId,
          s.exercise,
          s.setIndex,
          s.reps,
          s.loadKg,
        ],
      },
      r.activities.flatMap((a) => a.sets.map((s) => ({ ...s, activityId: a.id }))),
    ),
    table(
      'goals',
      {
        columns: [
          'id',
          'domain',
          'metric',
          'targetValue',
          'startValue',
          'habitId',
          'targetDay',
          'status',
          'createdDay',
        ],
        row: (g: GoalRecord) => [
          g.id,
          g.domain,
          g.metric,
          g.targetValue,
          g.startValue,
          g.habitId,
          g.targetDay,
          g.status,
          g.createdDay,
        ],
      },
      r.goals,
    ),
    table(
      'reminders',
      {
        columns: ['id', 'kind', 'habitId', 'timeMin', 'weekdays', 'enabled'],
        units: { timeMin: 'min' },
        row: (m: ReminderRecord) => [
          m.id,
          m.kind,
          m.habitId,
          m.timeMin,
          weekdays(m.weekdays),
          m.enabled,
        ],
      },
      r.reminders,
    ),
  ];
}

/** Quantidade de registros por tabela (seção "Seus dados", LEG-D01). */
export function tableCounts(tables: readonly ExportTable[]): Record<ExportTableName, number> {
  return Object.fromEntries(tables.map((t) => [t.name, t.rows.length])) as Record<
    ExportTableName,
    number
  >;
}
