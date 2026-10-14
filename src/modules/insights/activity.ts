import type { DateRange } from '@/lib/period';
import {
  activeDays,
  exerciseProgression,
  lastChange,
  minutesByType,
  sessionCount,
  totalMinutes,
  type ActivityRecord,
} from '@/modules/activity';
import { cap, duration, INSIGHT_RULES, int, periodArgs, select, sentence } from './rules';
import type { Highlight, InsightSentence, ModuleInsights } from './types';

export interface ActivityInsightsInput {
  records: ActivityRecord[];
  /** Registros do período anterior de mesmo tamanho (`previousRange`). */
  previous: ActivityRecord[];
  range: DateRange;
  today: string;
  /** Meta semanal de minutos da própria pessoa, se houver, com o valor da semana corrente. */
  weeklyGoal?: { current: number; target: number } | null;
}

/**
 * Resumo de atividade (§26, LEG-M08). Minutos e sessões, comparação com o próprio período anterior e com
 * a própria meta, e a progressão dos exercícios só em contagem (sem nome, sem sugestão de carga ou série).
 */
export function activityInsights({
  records,
  previous,
  range,
  today,
  weeklyGoal,
}: ActivityInsightsInput): ModuleInsights {
  const period = periodArgs(range, today);
  const base = { module: 'activity' as const, highlights: [] };
  if (records.length === 0) return { ...base, state: 'empty', sentences: [sentence('empty')] };

  const minutes = totalMinutes(records, range);
  const sessions = sessionCount(records, range);
  const total = sentence('total', {
    ...period,
    minutes: duration(minutes),
    sessions: int(sessions),
  });
  const goal = weeklyGoal
    ? sentence('goal', {
        current: duration(weeklyGoal.current),
        target: duration(weeklyGoal.target),
      })
    : null;
  if (sessions < INSIGHT_RULES.minRecords) {
    return { ...base, state: 'partial', sentences: cap([total, goal, sentence('partial')]) };
  }

  let compare: InsightSentence | null = null;
  if (previous.length >= INSIGHT_RULES.minRecords) {
    const prevMinutes = previous.reduce((acc, r) => acc + r.durationMin, 0);
    const diff = minutes - prevMinutes;
    const args = { diff: duration(Math.abs(diff)), days: period.days };
    compare =
      Math.abs(diff) < INSIGHT_RULES.activityMinutes
        ? sentence('compareSame', args)
        : sentence(diff > 0 ? 'compareMore' : 'compareLess', args);
  }
  const top = minutesByType(records, range)[0];
  const changes = exerciseProgression(records)
    .map((e) => lastChange(e.sessions, 'maxLoadKg'))
    .filter((c): c is NonNullable<typeof c> => c !== null);
  const progression =
    changes.length === 0
      ? null
      : sentence('progression', {
          exercises: int(changes.length),
          up: int(changes.filter((c) => c.delta > 0).length),
          same: int(changes.filter((c) => c.delta === 0).length),
          down: int(changes.filter((c) => c.delta < 0).length),
        });

  const highlights: Highlight[] = [
    { key: 'minutes', value: duration(minutes), level: 'ESTIMADO' },
    { key: 'sessions', value: int(sessions), level: 'INFORMADO' },
    { key: 'activeDays', value: int(activeDays(records, range)), level: 'INFORMADO' },
  ];

  return {
    ...base,
    state: 'ok',
    highlights,
    sentences: cap([
      total,
      goal ?? compare,
      top ? sentence('topType', { type: select(top.type) }) : null,
      progression,
    ]),
  };
}
