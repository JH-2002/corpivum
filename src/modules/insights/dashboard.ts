import { rangeLength } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { round } from '@/lib/stats';
import { completionRate, type HabitCheckRecord, type HabitRecord } from '@/modules/habits';
import { averageOf, type MoodRecord } from '@/modules/mood';
import { averageDurationMinutes, type SleepRecord } from '@/modules/sleep';
import { moodSupportSignal } from './mood';
import { cap, decimal, duration, INSIGHT_RULES, int, periodArgs, sentence } from './rules';
import type { Highlight, InsightArg, InsightSentence, ModuleInsights } from './types';

/** Registros de um período, como o dashboard já os carrega. */
export interface PeriodRecords {
  range: DateRange;
  sleep: SleepRecord[];
  mood: MoodRecord[];
  habits: HabitRecord[];
  checks: HabitCheckRecord[];
  /** Dias com qualquer registro (sono, humor, check, diário, corpo). */
  loggedDays: ReadonlySet<string>;
}

type Domain = 'sleep' | 'mood' | 'habits';

interface Change {
  domain: Domain;
  /** Atual − anterior, na unidade do domínio (min, pontos, fração). */
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
  if (enough(now.mood, before.mood)) {
    const diff = round(
      (averageOf(now.mood, 'mood') ?? 0) - (averageOf(before.mood, 'mood') ?? 0),
      1,
    );
    out.push({ domain: 'mood', diff, weight: Math.abs(diff) / INSIGHT_RULES.moodPoints });
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
  if (c.domain === 'mood') return decimal(Math.abs(c.diff));
  return int(Math.abs(c.diff) * 100);
}

function changeSentence(c: Change, days: InsightArg, gentleDrop: boolean): InsightSentence {
  const direction = c.diff > 0 ? 'Up' : gentleDrop ? 'DropGentle' : 'Down';
  return sentence(`${c.domain}${direction}`, { diff: amount(c), days });
}

/**
 * Resumo do dashboard (§11.1), substitui o `buildSummary` de uma frase: constância dos registros, as
 * maiores mudanças em relação ao período anterior (sono, humor, hábitos), hábitos em relação à frequência
 * prevista e, se for o caso, a orientação de apoio. Sem causa entre domínios.
 */
export function dashboardInsights(
  now: PeriodRecords,
  before: PeriodRecords,
  today: string,
): ModuleInsights {
  const period = periodArgs(now.range, today);
  const signal = moodSupportSignal(now.mood, before.mood);
  const supportSignal = signal.low || signal.drop || signal.lowest;
  const base = { module: 'dashboard' as const, highlights: [], supportSignal };
  const logged = now.loggedDays.size;
  if (logged === 0) return { ...base, state: 'empty', sentences: [sentence('empty')] };

  const coverage = sentence('coverage', {
    ...period,
    logged: int(logged),
    total: int(rangeLength(now.range)),
  });
  const pointer = supportSignal ? sentence('supportPointer') : null;
  if (logged < INSIGHT_RULES.minRecords) {
    return { ...base, state: 'partial', sentences: cap([coverage, sentence('partial'), pointer]) };
  }

  const all = changes(now, before);
  const relevant = all.filter((c) => c.weight >= 1);
  const [first, second] = relevant.map((c) =>
    changeSentence(c, period.days, c.domain === 'mood' && signal.drop),
  );
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
    sentences: cap([coverage, first ?? steady, pointer, second ?? null, habits]),
  };
}
