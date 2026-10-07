import type { DateRange } from '@/lib/period';
import type { BodyRecord } from '@/modules/body';
import type { DemoDataset } from '@/modules/demo/generator';
import type { HabitCheckRecord, HabitRecord } from '@/modules/habits';
import type { JournalFilter, JournalRecord } from '@/modules/journal';
import type { MoodRecord } from '@/modules/mood';
import type { SleepRecord } from '@/modules/sleep';

/**
 * Fonte dos dados exibidos (ADR-0021). As telas leem sempre por aqui, sem saber se os dados são da
 * pessoa (`own`: serviços com consentimento + RLS) ou fictícios (`demo`: gerador em memória). Assim o
 * modo demo nunca grava nem mistura dado fictício com real.
 */
export interface HealthDataSource {
  kind: 'own' | 'demo';
  sleep(range: DateRange, opts?: { withText?: boolean }): Promise<SleepRecord[]>;
  mood(range: DateRange, opts?: { withText?: boolean }): Promise<MoodRecord[]>;
  habits(opts?: { includeArchived?: boolean }): Promise<HabitRecord[]>;
  checks(range: DateRange): Promise<HabitCheckRecord[]>;
  journal(
    range: DateRange,
    opts?: { withText?: boolean; filter?: JournalFilter },
  ): Promise<JournalRecord[]>;
  body(range: DateRange): Promise<BodyRecord[]>;
  latestHeightCm(): Promise<number | null>;
  streaksEnabled(): Promise<boolean>;
  /** Há algum registro de saúde, de qualquer data? (estado vazio × sem dados no período). */
  hasAnyRecord(): Promise<boolean>;
}

const inRange = (day: string, range: DateRange) => day >= range.from && day <= range.to;

/** Fonte de demonstração: filtra o conjunto gerado. Sem rede, sem banco. */
export function createDemoSource(data: DemoDataset): HealthDataSource {
  return {
    kind: 'demo',
    sleep: async (range, opts) =>
      data.sleep
        .filter((r) => inRange(r.day, range))
        .map((r) => (opts?.withText ? r : { ...r, note: null })),
    mood: async (range, opts) =>
      data.mood
        .filter((r) => inRange(r.day, range))
        .map((r) => (opts?.withText ? r : { ...r, note: null })),
    habits: async () => data.habits,
    checks: async (range) => data.checks.filter((c) => inRange(c.day, range)),
    journal: async (range, opts) =>
      data.journal
        .filter((r) => inRange(r.day, range))
        .filter((r) => !opts?.filter?.mood || r.mood === opts.filter.mood)
        .filter((r) => !opts?.filter?.tag || r.tags.includes(opts.filter.tag))
        .map((r) => (opts?.withText ? r : { ...r, content: null })),
    body: async (range) => data.body.filter((r) => inRange(r.day, range)),
    latestHeightCm: async () => data.body.find((r) => r.heightCm !== null)?.heightCm ?? null,
    streaksEnabled: async () => true,
    hasAnyRecord: async () => true,
  };
}
