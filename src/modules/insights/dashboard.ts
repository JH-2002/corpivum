import { rangeLength } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { completionRate, type HabitCheckRecord, type HabitRecord } from '@/modules/habits';
import { averageDurationMinutes, type SleepRecord } from '@/modules/sleep';
import { cap, duration, INSIGHT_RULES, int, periodArgs, sentence } from './rules';
import type { Highlight, InsightArg, InsightSentence, ModuleInsights } from './types';

/** Registros de um período, como o dashboard já os carrega. */
export interface PeriodRecords {
  range: DateRange;
  sleep: SleepRecord[];
  habits: HabitRecord[];
  checks: HabitCheckRecord[];
  /** Dias com qualquer registro (sono, check, diário, corpo). */
  loggedDays: ReadonlySet<string>;
}

type Domain = 'sleep' | 'habits';

interface Change {
  domain: Domain;
  /** Atual − anterior, na unidade do domínio (min, fração). */
  diff: number;
  /** |diff| ÷ limiar do domínio: compara mudanças de unidades diferentes. */
  weight: number;
}

/** Mudanças em relação ao período anterior, só onde há amostra nos dois períodos. */
function changes(now: PeriodRecords, before: PeriodRecords): Change[] {
  const out: Change[] = [];
  const enough = (a: unknown[], b: unknown[]) =>
    a.length >= INSIGHT_RULES.minRecords && b.length >= INSIGHT_RULES.minRecords;
  if (enough(now.sleep, before.sleep)) {
    const diff =
      (averageDurationMinutes(now.sleep) ?? 0) - (averageDurationMinutes(before.sleep) ?? 0);
    out.push({ domain: 'sleep', diff, weight: Math.abs(diff) / INSIGHT_RULES.sleepMinutes });
  }
  const rate = completionRate(now.habits, now.checks, now.range);
  const prevRate = completionRate(before.habits, before.checks, before.range);
  if (rate !== null && prevRate !== null) {
    const diff = rate - prevRate;
    out.push({ domain: 'habits', diff, weight: Math.abs(diff) / INSIGHT_RULES.habitPoints });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

function amount(c: Change): InsightArg {
  if (c.domain === 'sleep') return duration(Math.abs(c.diff));
  return int(Math.abs(c.diff) * 100);
}

function changeSentence(c: Change, days: InsightArg): InsightSentence {
  const direction = c.diff > 0 ? 'Up' : 'Down';
  return sentence(`${c.domain}${direction}`, { diff: amount(c), days });
}

/**
 * Resumo do dashboard (§11.1), substitui o `buildSummary` de uma frase: constância dos registros, as
 * maiores mudanças em relação ao período anterior (sono, hábitos) e hábitos em relação à frequência
 * prevista. Sem causa entre domínios.
 */
export function dashboardInsights(
  now: PeriodRecords,
  before: PeriodRecords,
  today: string,
): ModuleInsights {
  const period = periodArgs(now.range, today);
  const base = { module: 'dashboard' as const, highlights: [], supportSignal: false };
  const logged = now.loggedDays.size;
  if (logged === 0) return { ...base, state: 'empty', sentences: [sentence('empty')] };

  const coverage = sentence('coverage', {
    ...period,
    logged: int(logged),
    total: int(rangeLength(now.range)),
  });
  if (logged < INSIGHT_RULES.minRecords) {
    return { ...base, state: 'partial', sentences: cap([coverage, sentence('partial')]) };
  }

  const all = changes(now, before);
  const relevant = all.filter((c) => c.weight >= 1);
  const [first, second] = relevant.map((c) => changeSentence(c, period.days));
  const rate = completionRate(now.habits, now.checks, now.range);
  const habitsMentioned = relevant.slice(0, 2).some((c) => c.domain === 'habits');
  const habits =
    rate !== null && !habitsMentioned ? sentence('habits', { percent: int(rate * 100) }) : null;
  const steady =
    all.length > 0 && relevant.length === 0 ? sentence('steady', { days: period.days }) : null;

  const highlights: Highlight[] = [];
  const top = relevant[0];
  if (top) {
    highlights.push({
      key: `largest.${top.domain}`,
      value: amount(top),
      detail: sentence(top.diff > 0 ? 'changeUp' : 'changeDown', { days: period.days }),
      level: 'ESTIMADO',
    });
  }

  return {
    ...base,
    state: 'ok',
    highlights,
    sentences: cap([coverage, first ?? steady, second ?? null, habits]),
  };
}
