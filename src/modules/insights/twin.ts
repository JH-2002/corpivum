import { rangeLength } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import type { BodyRecord } from '@/modules/body';
import { completionRate, type HabitCheckRecord, type HabitRecord } from '@/modules/habits';
import { averageOf, type MoodRecord } from '@/modules/mood';
import { averageDurationMinutes, scheduleSpreadMinutes, type SleepRecord } from '@/modules/sleep';
import {
  BRAIN_THEMES,
  bodyShape,
  bodySnapshotAt,
  measurementDays,
  type BrainTheme,
} from '@/modules/twin';
import { moodSupportSignal } from './mood';
import { cap, days, decimal, duration, INSIGHT_RULES, int, periodArgs, sentence } from './rules';
import type { InsightArg, ModuleInsights } from './types';

export interface TwinBodyInsightsInput {
  /** Medições do período, em ordem crescente de data. */
  records: BodyRecord[];
  /** Última altura informada em qualquer data (usada se o período não tiver altura). */
  latestHeightCm: number | null;
  range: DateRange;
  today: string;
}

/** Altura + 5 circunferências: as medidas que dão forma ao modelo. */
const SHAPE_MEASURES = 6;

/**
 * Resumo do corpo 3D (§15, ADR-0025/0026): quantas medidas informadas dão forma ao modelo, o que fica
 * na forma neutra, o alcance do controle de datas e que o peso não muda a forma. Sem IMC, sem
 * classificação e sem juízo sobre o corpo (LEG-M04).
 */
export function twinBodyInsights({
  records,
  latestHeightCm,
  range,
  today,
}: TwinBodyInsightsInput): ModuleInsights {
  const period = periodArgs(range, today);
  const base = { module: 'twin' as const, highlights: [], supportSignal: false };
  if (records.length === 0) return { ...base, state: 'empty', sentences: [sentence('empty')] };

  const dates = measurementDays(records);
  const last = dates[dates.length - 1] ?? today;
  const shape = bodyShape(bodySnapshotAt(records, last, latestHeightCm));
  const informed = SHAPE_MEASURES - shape.missing.length - (shape.heightMissing ? 1 : 0);
  const shapeFrom = sentence('shapeFrom', {
    ...period,
    count: int(informed),
    total: int(SHAPE_MEASURES),
  });
  const neutral =
    shape.missing.length > 0 || shape.heightMissing
      ? sentence('neutral', { count: int(SHAPE_MEASURES - informed) })
      : null;
  const weightNote = records.some((r) => r.weightKg !== null) ? sentence('weightNote') : null;

  if (dates.length < 2) {
    return { ...base, state: 'partial', sentences: cap([shapeFrom, sentence('partial'), neutral]) };
  }
  return {
    ...base,
    state: 'ok',
    sentences: cap([
      shapeFrom,
      sentence('dates', {
        count: int(dates.length),
        first: days([dates[0] ?? last], range),
        last: days([last], range),
      }),
      neutral,
      weightNote,
    ]),
  };
}

/** Indicador de um tema no painel do cérebro: chave em `insights.brain.indicators.*` e valor. */
export interface ThemeIndicator {
  key: string;
  value: InsightArg;
  level: 'INFORMADO' | 'ESTIMADO';
}

export interface BrainThemeData {
  /** Dias do período com registro do tema. */
  days: number;
  indicators: ThemeIndicator[];
}

/**
 * Registros da pessoa nos temas ligados às regiões (§17), já resumidos no servidor: só números, sem nota,
 * nome de hábito ou texto do diário. Nada disso descreve a região: são os registros sobre o tema.
 */
export interface BrainThemes {
  periodDays: number;
  themes: Record<BrainTheme, BrainThemeData>;
  /** Mesmo critério da tela de humor (média baixa, queda ou ponto mais baixo): orientação de apoio (§48). */
  supportSignal: boolean;
}

export interface BrainThemesInput {
  sleep: SleepRecord[];
  mood: MoodRecord[];
  /** Humor do período anterior de mesmo tamanho: a queda relevante também mostra o apoio (§48). */
  previousMood: MoodRecord[];
  habits: HabitRecord[];
  checks: HabitCheckRecord[];
  range: DateRange;
}

const uniqueDays = (rows: ReadonlyArray<{ day: string }>, range: DateRange) =>
  new Set(rows.map((r) => r.day).filter((d) => d >= range.from && d <= range.to)).size;

export function brainThemes({
  sleep,
  mood,
  previousMood,
  habits,
  checks,
  range,
}: BrainThemesInput): BrainThemes {
  const sleepAvg = averageDurationMinutes(sleep);
  const spread = sleep.length >= 2 ? scheduleSpreadMinutes(sleep) : null;
  const moodAvg = averageOf(mood, 'mood');
  const energyAvg = averageOf(mood, 'energy');
  const completion = completionRate(habits, checks, range);
  const signal = moodSupportSignal(mood, previousMood);

  const indicator = (key: string, value: InsightArg | null): ThemeIndicator[] =>
    value === null ? [] : [{ key, value, level: 'ESTIMADO' }];

  return {
    periodDays: rangeLength(range),
    supportSignal: signal.low || signal.drop || signal.lowest,
    themes: {
      sleep: {
        days: uniqueDays(sleep, range),
        indicators: [
          ...indicator('sleepAverage', sleepAvg === null ? null : duration(sleepAvg)),
          ...indicator('sleepSpread', spread === null ? null : duration(spread)),
        ],
      },
      mood: {
        days: uniqueDays(mood, range),
        indicators: [
          ...indicator('moodAverage', moodAvg === null ? null : decimal(moodAvg)),
          ...indicator('energyAverage', energyAvg === null ? null : decimal(energyAvg)),
        ],
      },
      habits: {
        days: uniqueDays(checks, range),
        indicators: indicator(
          'habitsCompletion',
          completion === null ? null : int(completion * 100),
        ),
      },
    },
  };
}

/**
 * Resumo da tela do cérebro 3D (§17, LEG-M05): o modelo é educativo e igual para todas as pessoas, e o
 * texto diz quantos dias de registro existem nos temas ligados às regiões. Nunca descreve a região.
 */
export function brainInsights(
  themes: BrainThemes,
  range: DateRange,
  today: string,
): ModuleInsights {
  const period = periodArgs(range, today);
  const count = (t: BrainTheme) => int(themes.themes[t].days);
  const base = { module: 'brain' as const, highlights: [], supportSignal: themes.supportSignal };
  const any = BRAIN_THEMES.some((t) => themes.themes[t].days > 0);
  if (!any) {
    return { ...base, state: 'empty', sentences: [sentence('empty'), sentence('educational')] };
  }
  const enough = BRAIN_THEMES.every((t) => themes.themes[t].days >= INSIGHT_RULES.minRecords);
  return {
    ...base,
    state: enough ? 'ok' : 'partial',
    sentences: cap([
      sentence('themesUsed', {
        ...period,
        sleep: count('sleep'),
        mood: count('mood'),
        habits: count('habits'),
      }),
      sentence('educational'),
      sentence('pickRegion'),
    ]),
  };
}
