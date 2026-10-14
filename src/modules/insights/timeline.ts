import type { DateRange } from '@/lib/period';
import type { TimelineDay } from '@/modules/timeline';
import { int, periodArgs, sentence } from './rules';
import type { ModuleInsights } from './types';

export interface TimelineInsightsInput {
  days: TimelineDay[];
  range: DateRange;
  today: string;
}

/** Resumo da timeline (§31): quantos registros, em quantos dias, e quantos marcos. Sem juízo. */
export function timelineInsights({ days, range, today }: TimelineInsightsInput): ModuleInsights {
  const base = { module: 'timeline' as const, highlights: [] };
  if (days.length === 0) return { ...base, state: 'empty', sentences: [sentence('empty')] };
  const entries = days.reduce(
    (acc, d) => acc + d.items.filter((i) => i.kind !== 'milestone').length,
    0,
  );
  const milestones = days.reduce(
    (acc, d) => acc + d.items.filter((i) => i.kind === 'milestone').length,
    0,
  );
  return {
    ...base,
    state: 'ok',
    sentences: [
      sentence('summary', {
        ...periodArgs(range, today),
        entries: int(entries),
        activeDays: int(days.length),
      }),
      milestones > 0 ? sentence('milestones', { count: int(milestones) }) : null,
    ].filter((s) => s !== null),
  };
}
