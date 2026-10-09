import type { DateRange } from '@/lib/period';
import {
  averageDurationMinutes,
  dailyHours,
  scheduleSpreadMinutes,
  type SleepRecord,
} from '@/modules/sleep';
import {
  cap,
  days,
  duration,
  extremeDays,
  INSIGHT_RULES,
  int,
  periodArgs,
  sentence,
} from './rules';
import type { Highlight, InsightSentence, ModuleInsights } from './types';

export interface SleepInsightsInput {
  records: SleepRecord[];
  /** Registros do período anterior de mesmo tamanho (`previousRange`). */
  previous: SleepRecord[];
  range: DateRange;
  today: string;
}

/**
 * Resumo de sono (§20): média, comparação com o período anterior, noites mais curtas e mais longas e
 * variação de horário. Descreve os registros; não avalia a qualidade do sono nem compara com referência.
 */
export function sleepInsights({
  records,
  previous,
  range,
  today,
}: SleepInsightsInput): ModuleInsights {
  const period = periodArgs(range, today);
  const base = { module: 'sleep' as const, highlights: [] };
  if (records.length === 0) return { ...base, state: 'empty', sentences: [sentence('empty')] };

  const avg = averageDurationMinutes(records) ?? 0;
  const average = sentence('average', {
    ...period,
    avg: duration(avg),
    count: int(records.length),
  });
  if (records.length < INSIGHT_RULES.minRecords) {
    return { ...base, state: 'partial', sentences: [average, sentence('partial')] };
  }

  const minutesByDay = dailyHours(records, range).map((d) => ({
    day: d.day,
    value: d.hours === null ? null : Math.round(d.hours * 60),
  }));
  const shortest = extremeDays(minutesByDay, 'min', records.length >= 4 ? 2 : 1);
  const longest = extremeDays(minutesByDay, 'max', 1);
  const spread = scheduleSpreadMinutes(records);

  let compare: InsightSentence | null = null;
  let diff: number | null = null;
  if (previous.length >= INSIGHT_RULES.minRecords) {
    diff = avg - (averageDurationMinutes(previous) ?? 0);
    const args = { diff: duration(Math.abs(diff)), days: period.days };
    compare =
      Math.abs(diff) < INSIGHT_RULES.sleepMinutes
        ? sentence('compareSame', args)
        : sentence(diff > 0 ? 'compareMore' : 'compareLess', args);
  }

  const highlights: Highlight[] = [];
  const longestDay = longest[0];
  const longestValue = minutesByDay.find((d) => d.day === longestDay)?.value;
  if (longestDay && longestValue != null) {
    highlights.push({
      key: 'longest',
      value: duration(longestValue),
      detail: sentence('onDays', { when: days([longestDay], range) }),
      level: 'INFORMADO',
    });
  }
  const shortestDay = extremeDays(minutesByDay, 'min', 1)[0];
  const shortestValue = minutesByDay.find((d) => d.day === shortestDay)?.value;
  if (shortestDay && shortestValue != null && shortestDay !== longestDay) {
    highlights.push({
      key: 'shortest',
      value: duration(shortestValue),
      detail: sentence('onDays', { when: days([shortestDay], range) }),
      level: 'INFORMADO',
    });
  }
  if (diff !== null) {
    highlights.push({
      key: 'change',
      value: duration(Math.abs(diff)),
      detail: sentence(diff >= 0 ? 'changeMore' : 'changeLess', { days: period.days }),
      level: 'ESTIMADO',
    });
  }

  return {
    ...base,
    state: 'ok',
    highlights,
    sentences: cap([
      average,
      compare,
      longest.length && shortest.length && !shortest.includes(longest[0] ?? '')
        ? sentence('extremes', {
            shortest: days(shortest, range),
            shortestCount: int(shortest.length),
            longest: days(longest, range),
          })
        : null,
      spread === null
        ? null
        : spread < INSIGHT_RULES.scheduleSteadyMinutes
          ? sentence('spreadSteady')
          : sentence('spread', { spread: duration(spread) }),
    ]),
  };
}
