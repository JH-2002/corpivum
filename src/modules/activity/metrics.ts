import { eachDay } from '@/lib/dates';
import { round } from '@/lib/stats';
import type { DateRange } from '@/lib/period';
import type { ActivityRecord, ActivityType } from './types';

/**
 * Métricas de atividade (§26), funções puras. Descrevem minutos, sessões e a progressão de cada exercício
 * só em relação ao próprio histórico da pessoa. Nada aqui sugere carga, série ou treino (LEG-M08) nem
 * calcula calorias gastas (LEG-M07).
 */

const inRange = (day: string, range: DateRange) => day >= range.from && day <= range.to;

/** Minutos ativos somados no intervalo. */
export function totalMinutes(records: ActivityRecord[], range: DateRange): number {
  return records.filter((r) => inRange(r.day, range)).reduce((acc, r) => acc + r.durationMin, 0);
}

/** Sessões (registros) no intervalo. */
export function sessionCount(records: ActivityRecord[], range: DateRange): number {
  return records.filter((r) => inRange(r.day, range)).length;
}

/** Dias do intervalo com alguma atividade. */
export function activeDays(records: ActivityRecord[], range: DateRange): number {
  return new Set(records.filter((r) => inRange(r.day, range)).map((r) => r.day)).size;
}

/** Minutos ativos por dia do intervalo; `null` nos dias sem registro. */
export function dailyMinutes(
  records: ActivityRecord[],
  range: DateRange,
): Array<{ day: string; minutes: number | null }> {
  const byDay = new Map<string, number>();
  for (const r of records) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.durationMin);
  return eachDay(range).map((day) => ({ day, minutes: byDay.get(day) ?? null }));
}

/** Minutos por tipo de atividade no intervalo, do maior para o menor. */
export function minutesByType(
  records: ActivityRecord[],
  range: DateRange,
): Array<{ type: ActivityType; minutes: number }> {
  const byType = new Map<ActivityType, number>();
  for (const r of records.filter((x) => inRange(x.day, range))) {
    byType.set(r.type, (byType.get(r.type) ?? 0) + r.durationMin);
  }
  return [...byType.entries()]
    .map(([type, minutes]) => ({ type, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

/** Nome do exercício normalizado para agrupar ("Supino reto" = "supino  reto"). */
export function exerciseKey(name: string): string {
  return name.normalize('NFC').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
}

/** Uma sessão de um exercício: o que foi registrado naquele dia. */
export interface ExerciseSession {
  day: string;
  sets: number;
  totalReps: number;
  /** Maior carga registrada na sessão; `null` sem carga externa. */
  maxLoadKg: number | null;
  /** Soma de repetições × carga; `null` sem carga externa. */
  volumeKg: number | null;
}

export interface ExerciseProgression {
  key: string;
  /** Nome como a pessoa escreveu na primeira vez. */
  label: string;
  sessions: ExerciseSession[];
}

/**
 * Progressão por exercício: uma linha por sessão, em ordem de data. É só o histórico da própria pessoa,
 * descrito; a tela compara a última sessão com a anterior em número, seta e palavra.
 */
export function exerciseProgression(records: ActivityRecord[]): ExerciseProgression[] {
  const byKey = new Map<string, ExerciseProgression>();
  const sorted = [...records].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const r of sorted) {
    const perExercise = new Map<string, ExerciseSession>();
    for (const s of r.sets) {
      const key = exerciseKey(s.exercise);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, { key, label: s.exercise.trim(), sessions: [] });
      const session = perExercise.get(key) ?? {
        day: r.day,
        sets: 0,
        totalReps: 0,
        maxLoadKg: null,
        volumeKg: null,
      };
      session.sets += 1;
      session.totalReps += s.reps;
      if (s.loadKg !== null) {
        session.maxLoadKg = Math.max(session.maxLoadKg ?? 0, s.loadKg);
        session.volumeKg = round((session.volumeKg ?? 0) + s.reps * s.loadKg, 1);
      }
      perExercise.set(key, session);
    }
    for (const [key, session] of perExercise) byKey.get(key)?.sessions.push(session);
  }
  return [...byKey.values()].sort(
    (a, b) => b.sessions.length - a.sessions.length || a.label.localeCompare(b.label, 'pt-BR'),
  );
}

/** Mudança da última sessão em relação à anterior, na própria série histórica. */
export function lastChange(
  sessions: ExerciseSession[],
  field: 'maxLoadKg' | 'totalReps' | 'volumeKg',
): { previous: number; current: number; delta: number } | null {
  if (sessions.length < 2) return null;
  const previous = sessions[sessions.length - 2]?.[field] ?? null;
  const current = sessions[sessions.length - 1]?.[field] ?? null;
  if (previous === null || current === null) return null;
  return { previous, current, delta: round(current - previous, 1) };
}
