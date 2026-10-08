import { daysBetween, rangeLength } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { JOURNAL_TAGS, type JournalRecord, type JournalTag } from '@/modules/journal';
import { cap, days, INSIGHT_RULES, int, periodArgs, sentence } from './rules';
import type { Highlight, ModuleInsights } from './types';

/** Só os metadados da entrada: o resumo nunca lê o conteúdo do diário (LEG-S02). */
export type JournalMeta = Pick<JournalRecord, 'day' | 'tags'>;

export interface JournalInsightsInput {
  entries: JournalMeta[];
  previous: JournalMeta[];
  range: DateRange;
  today: string;
}

/** Etiqueta mais usada (empate: ordem fixa de `JOURNAL_TAGS`), ou `null` sem etiquetas. */
function topTag(entries: JournalMeta[]): { tag: JournalTag; count: number } | null {
  let best: { tag: JournalTag; count: number } | null = null;
  for (const tag of JOURNAL_TAGS) {
    const count = entries.filter((e) => e.tags.includes(tag)).length;
    if (count > 0 && (!best || count > best.count)) best = { tag, count };
  }
  return best;
}

/** Maior intervalo (em dias) entre duas entradas seguidas no período. */
function longestGap(sortedDays: string[]): number {
  let gap = 0;
  for (let i = 1; i < sortedDays.length; i += 1) {
    const prev = sortedDays[i - 1];
    const cur = sortedDays[i];
    if (prev && cur) gap = Math.max(gap, daysBetween(prev, cur));
  }
  return gap;
}

/**
 * Resumo do diário (§19): quantidade de entradas, dias com entrada, comparação com o período anterior,
 * etiqueta mais usada e maior intervalo. Usa só dia e etiquetas: o texto cifrado não é lido.
 */
export function journalInsights({
  entries,
  previous,
  range,
  today,
}: JournalInsightsInput): ModuleInsights {
  const period = periodArgs(range, today);
  const base = { module: 'journal' as const, highlights: [], supportSignal: false };
  if (entries.length === 0) return { ...base, state: 'empty', sentences: [sentence('empty')] };

  const uniqueDays = [...new Set(entries.map((e) => e.day))].sort();
  const count = sentence('count', {
    ...period,
    count: int(entries.length),
    daysWith: int(uniqueDays.length),
    total: int(rangeLength(range)),
  });
  if (entries.length < INSIGHT_RULES.minRecords) {
    return { ...base, state: 'partial', sentences: [count, sentence('partial')] };
  }

  const tag = topTag(entries);
  const gap = longestGap(uniqueDays);
  const highlights: Highlight[] = [];
  if (tag) {
    highlights.push({
      key: 'topTag',
      value: { kind: 'tag', value: tag.tag },
      detail: sentence('tagCount', { count: int(tag.count) }),
      level: 'INFORMADO',
    });
  }
  highlights.push({
    key: 'daysWith',
    value: int(uniqueDays.length),
    detail: sentence('ofTotal', { total: int(rangeLength(range)) }),
    level: 'INFORMADO',
  });

  return {
    ...base,
    state: 'ok',
    highlights,
    sentences: cap([
      count,
      sentence('compare', { previous: int(previous.length), days: period.days }),
      tag ? sentence('topTag', { tag: { kind: 'tag', value: tag.tag } }) : null,
      gap >= INSIGHT_RULES.journalGapDays
        ? sentence('gap', { gap: int(gap) })
        : sentence('latest', { when: days(uniqueDays.slice(-1), range) }),
    ]),
  };
}
