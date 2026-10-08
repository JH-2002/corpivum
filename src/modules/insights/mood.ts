import type { DateRange } from '@/lib/period';
import {
  averageOf,
  dailyAverages,
  LOW_MOOD_SUPPORT_THRESHOLD,
  type MoodRecord,
} from '@/modules/mood';
import { round } from '@/lib/stats';
import { cap, days, decimal, extremeDays, INSIGHT_RULES, int, periodArgs, sentence } from './rules';
import type { Highlight, InsightSentence, ModuleInsights } from './types';

export interface MoodInsightsInput {
  records: MoodRecord[];
  previous: MoodRecord[];
  range: DateRange;
  today: string;
}

/**
 * Quando mostrar a orientação de apoio junto do resumo (§48): média do período na parte de baixo da
 * escala, queda relevante em relação ao período anterior ou algum registro no ponto mais baixo. Só
 * decide a exibição de um aviso fixo; não é avaliação de risco nem de condição.
 */
export function moodSupportSignal(
  records: MoodRecord[],
  previous: MoodRecord[],
): { low: boolean; drop: boolean; lowest: boolean } {
  const avg = averageOf(records, 'mood');
  const prevAvg = averageOf(previous, 'mood');
  const comparable =
    records.length >= INSIGHT_RULES.minRecords && previous.length >= INSIGHT_RULES.minRecords;
  return {
    low: avg !== null && avg <= INSIGHT_RULES.lowMoodAverage,
    drop:
      comparable &&
      avg !== null &&
      prevAvg !== null &&
      round(prevAvg - avg, 1) >= INSIGHT_RULES.moodDropRelevant,
    lowest: records.some((r) => r.mood <= LOW_MOOD_SUPPORT_THRESHOLD),
  };
}

/**
 * Resumo de humor e energia (§21): médias informadas, comparação com o período anterior e dias com humor
 * mais alto e mais baixo. Tom descritivo e acolhedor, sem dramatizar e SEM CAUSA: nenhuma frase liga o
 * humor a sono, hábitos ou qualquer outro fator (correlações só no §32, com amostra mínima).
 */
export function moodInsights({
  records,
  previous,
  range,
  today,
}: MoodInsightsInput): ModuleInsights {
  const period = periodArgs(range, today);
  const signal = moodSupportSignal(records, previous);
  const supportSignal = signal.low || signal.drop || signal.lowest;
  const pointer = supportSignal ? sentence('supportPointer') : null;
  const base = { module: 'mood' as const, highlights: [], supportSignal };
  if (records.length === 0) return { ...base, state: 'empty', sentences: [sentence('empty')] };

  const avg = averageOf(records, 'mood') ?? 0;
  const average = sentence('average', {
    ...period,
    mood: decimal(avg),
    energy: decimal(averageOf(records, 'energy') ?? 0),
    count: int(records.length),
  });
  if (records.length < INSIGHT_RULES.minRecords) {
    return { ...base, state: 'partial', sentences: cap([average, sentence('partial'), pointer]) };
  }

  let compare: InsightSentence | null = null;
  let diff: number | null = null;
  if (previous.length >= INSIGHT_RULES.minRecords) {
    diff = round(avg - (averageOf(previous, 'mood') ?? 0), 1);
    const args = { diff: decimal(Math.abs(diff)), days: period.days };
    compare =
      Math.abs(diff) < INSIGHT_RULES.moodPoints
        ? sentence('compareSame', args)
        : diff > 0
          ? sentence('compareUp', args)
          : sentence(signal.drop ? 'dropGentle' : 'compareDown', args);
  }

  const byDay = dailyAverages(records, range).map((d) => ({ day: d.day, value: d.mood }));
  const highest = extremeDays(byDay, 'max', 1);
  const lowest = extremeDays(byDay, 'min', 1);
  const valueOn = (day: string | undefined) => byDay.find((d) => d.day === day)?.value ?? null;
  const distinct = highest[0] !== lowest[0] && valueOn(highest[0]) !== valueOn(lowest[0]);

  const highlights: Highlight[] = [];
  if (distinct && highest[0] && lowest[0]) {
    highlights.push(
      {
        key: 'highest',
        value: decimal(valueOn(highest[0]) ?? 0),
        detail: sentence('onDays', { when: days(highest, range) }),
        level: 'INFORMADO',
      },
      {
        key: 'lowest',
        value: decimal(valueOn(lowest[0]) ?? 0),
        detail: sentence('onDays', { when: days(lowest, range) }),
        level: 'INFORMADO',
      },
    );
  }
  if (diff !== null) {
    highlights.push({
      key: 'change',
      value: decimal(Math.abs(diff)),
      detail: sentence(diff >= 0 ? 'changeUp' : 'changeDown', { days: period.days }),
      level: 'ESTIMADO',
    });
  }

  return {
    ...base,
    state: 'ok',
    highlights,
    // Prioridade: média, comparação, período baixo e apoio; os dias extremos entram se couber.
    sentences: cap([
      average,
      compare,
      signal.low ? sentence('lowPeriod') : null,
      pointer,
      distinct
        ? sentence('extremes', { highest: days(highest, range), lowest: days(lowest, range) })
        : null,
    ]),
  };
}
