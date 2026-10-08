import { eachDay, rangeLength } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { clamp, mean } from '@/lib/stats';
import type { HabitCheckRecord, HabitRecord } from '@/modules/habits';
import { completionRate, expectedOccurrences } from '@/modules/habits';
import type { MoodRecord } from '@/modules/mood';
import { scheduleSpreadMinutes, type SleepRecord } from '@/modules/sleep';

/**
 * Índice de Bem-Estar (§14, LEG-D08). Indicador de 0 a 100 que resume os registros da própria pessoa
 * (regularidade do sono, humor/energia informados, hábitos e constância de registro). Não é avaliação de saúde, não usa referência populacional e não classifica.
 *
 * Versionado: mudar pesos, limiares ou fórmulas = nova versão (novo objeto `SCORE_Vn` e `SCORE_VERSION`),
 * documentada em docs/WELLBEING_SCORE.md. Componentes sem dados suficientes ficam fora do cálculo e os
 * pesos são renormalizados entre os incluídos ("dados parciais").
 */
export const SCORE_V1 = Object.freeze({
  version: 1,
  weights: Object.freeze({
    sleepRegularity: 0.25,
    moodEnergy: 0.25,
    habits: 0.2,
    activity: 0.15,
    logging: 0.15,
  }),
  /** Mínimo de registros no período para o componente entrar. */
  minSleepRecords: 3,
  minMoodRecords: 3,
  minExpectedHabitChecks: 3,
  /** Variação média de horário (min) em que a regularidade do sono chega a 0. */
  sleepSpreadZeroAt: 120,
  /** Mínimo de componentes incluídos para haver valor. */
  minIncluded: 2,
});

export const SCORE_VERSION = SCORE_V1.version;

export const SCORE_COMPONENTS = [
  'sleepRegularity',
  'moodEnergy',
  'habits',
  'activity',
  'logging',
] as const;
export type ScoreComponentId = (typeof SCORE_COMPONENTS)[number];

/** Por que um componente ficou fora do cálculo. */
export type ExclusionReason = 'insufficient_data' | 'no_habits' | 'not_available';

export interface ScoreComponent {
  id: ScoreComponentId;
  /** Peso nominal da versão. */
  weight: number;
  included: boolean;
  /** 0–100 quando incluído. */
  value: number | null;
  /** Peso efetivo após renormalizar entre os incluídos. */
  effectiveWeight: number | null;
  /** Quantidade de registros considerada (para a explicação). */
  sample: number;
  reason: ExclusionReason | null;
}

export interface WellbeingScore {
  version: number;
  range: DateRange;
  /** `null` = dados insuficientes (menos de `minIncluded` componentes). */
  value: number | null;
  /** Algum componente ficou de fora. */
  partial: boolean;
  components: ScoreComponent[];
}

export interface ScoreInput {
  range: DateRange;
  sleep: SleepRecord[];
  mood: MoodRecord[];
  habits: HabitRecord[];
  checks: HabitCheckRecord[];
  /** Dias com qualquer registro (sono, humor, check, diário, corpo) no período. */
  loggedDays: ReadonlySet<string>;
}

type Partial0 = Omit<ScoreComponent, 'weight' | 'effectiveWeight'>;

function sleepRegularity(input: ScoreInput): Partial0 {
  const sample = input.sleep.length;
  const spread = sample >= SCORE_V1.minSleepRecords ? scheduleSpreadMinutes(input.sleep) : null;
  if (spread === null) {
    return {
      id: 'sleepRegularity',
      included: false,
      value: null,
      sample,
      reason: 'insufficient_data',
    };
  }
  const value = Math.round(clamp(100 * (1 - spread / SCORE_V1.sleepSpreadZeroAt), 0, 100));
  return { id: 'sleepRegularity', included: true, value, sample, reason: null };
}

function moodEnergy(input: ScoreInput): Partial0 {
  const sample = input.mood.length;
  if (sample < SCORE_V1.minMoodRecords) {
    return { id: 'moodEnergy', included: false, value: null, sample, reason: 'insufficient_data' };
  }
  // Média de humor e energia autorrelatados (1–5) levada a 0–100.
  const avg = mean(input.mood.map((r) => (r.mood + r.energy) / 2)) ?? 1;
  return {
    id: 'moodEnergy',
    included: true,
    value: Math.round(((avg - 1) / 4) * 100),
    sample,
    reason: null,
  };
}

function habits(input: ScoreInput): Partial0 {
  const active = input.habits.filter((h) => !h.archived);
  const sample = input.checks.length;
  if (active.length === 0) {
    return { id: 'habits', included: false, value: null, sample, reason: 'no_habits' };
  }
  const expected = active.reduce((acc, h) => acc + expectedOccurrences(h, input.range), 0);
  const rate = completionRate(active, input.checks, input.range);
  if (expected < SCORE_V1.minExpectedHabitChecks || rate === null) {
    return { id: 'habits', included: false, value: null, sample, reason: 'insufficient_data' };
  }
  return { id: 'habits', included: true, value: Math.round(rate * 100), sample, reason: null };
}

/** Atividade física ainda não tem módulo (Fase 4): fica fora na v1, sempre. */
function activity(): Partial0 {
  return { id: 'activity', included: false, value: null, sample: 0, reason: 'not_available' };
}

/**
 * Constância de registro: dias com algum registro ÷ dias desde o primeiro registro do período até o fim
 * dele. Contar só a partir do primeiro registro evita penalizar quem começou no meio do período.
 */
function logging(input: ScoreInput): Partial0 {
  const days = eachDay(input.range).filter((d) => input.loggedDays.has(d));
  const first = days[0];
  if (!first) {
    return { id: 'logging', included: false, value: null, sample: 0, reason: 'insufficient_data' };
  }
  const span = rangeLength({ from: first, to: input.range.to });
  return {
    id: 'logging',
    included: true,
    value: Math.round((days.length / span) * 100),
    sample: days.length,
    reason: null,
  };
}

/** Calcula o Índice v1. Determinístico: mesmos registros e período → mesmo resultado. */
export function computeWellbeingScore(input: ScoreInput): WellbeingScore {
  const raw = [
    sleepRegularity(input),
    moodEnergy(input),
    habits(input),
    activity(),
    logging(input),
  ];
  const includedWeight = raw
    .filter((c) => c.included)
    .reduce((acc, c) => acc + SCORE_V1.weights[c.id], 0);
  const components: ScoreComponent[] = raw.map((c) => ({
    ...c,
    weight: SCORE_V1.weights[c.id],
    effectiveWeight:
      c.included && includedWeight > 0 ? SCORE_V1.weights[c.id] / includedWeight : null,
  }));
  const included = components.filter((c) => c.included);
  const value =
    included.length >= SCORE_V1.minIncluded
      ? Math.round(included.reduce((acc, c) => acc + (c.value ?? 0) * (c.effectiveWeight ?? 0), 0))
      : null;
  return {
    version: SCORE_V1.version,
    range: input.range,
    value,
    partial: included.length < components.length,
    components,
  };
}
