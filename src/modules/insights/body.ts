import type { DateRange } from '@/lib/period';
import { change, latest, type BodyField, type BodyRecord } from '@/modules/body';
import { cap, days, decimal, INSIGHT_RULES, int, periodArgs, sentence, signed } from './rules';
import type { Highlight, ModuleInsights } from './types';

const GIRTHS: BodyField[] = ['waistCm', 'hipCm', 'armCm', 'thighCm', 'chestCm'];

export interface BodyInsightsInput {
  /** Medições do período, em ordem crescente de data. */
  records: BodyRecord[];
  range: DateRange;
  today: string;
}

/**
 * Resumo de peso e medidas (§23, LEG-M04): último peso, variação do primeiro ao último registro do
 * período e a circunferência que mais variou. Verbo neutro ("variou"), sem IMC, sem "ganhou/perdeu",
 * sem meta e sem classificação.
 */
export function bodyInsights({ records, range, today }: BodyInsightsInput): ModuleInsights {
  const period = periodArgs(range, today);
  const base = { module: 'body' as const, highlights: [] };
  if (records.length === 0) return { ...base, state: 'empty', sentences: [sentence('empty')] };

  const weight = latest(records, 'weightKg');
  const first = weight
    ? sentence('latestWeight', {
        ...period,
        kg: decimal(weight.value),
        when: days([weight.day], range),
      })
    : sentence('count', { ...period, count: int(records.length) });
  if (records.length < 2) {
    return { ...base, state: 'partial', sentences: [first, sentence('partial')] };
  }

  const weightChange = change(records, 'weightKg');
  const girth = GIRTHS.map((field) => ({ field, value: change(records, field) }))
    .filter((g): g is { field: BodyField; value: number } => g.value !== null && g.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];

  const highlights: Highlight[] = [];
  if (weightChange !== null) {
    highlights.push({
      key: 'weightChange',
      value: signed(weightChange),
      detail: sentence('sinceFirst'),
      level: 'ESTIMADO',
    });
  }
  if (girth) {
    highlights.push({
      key: 'girthChange',
      value: signed(girth.value),
      detail: sentence('girthField', { field: { kind: 'field', value: girth.field } }),
      level: 'ESTIMADO',
    });
  }

  return {
    ...base,
    state: 'ok',
    highlights,
    sentences: cap([
      first,
      weightChange === null
        ? null
        : Math.abs(weightChange) < INSIGHT_RULES.weightKg
          ? sentence('weightStable')
          : sentence('weightChange', { kg: signed(weightChange) }),
      girth
        ? sentence('girthChange', {
            field: { kind: 'field', value: girth.field },
            cm: signed(girth.value),
          })
        : null,
      weight ? sentence('countTail', { count: int(records.length) }) : null,
    ]),
  };
}

/**
 * Variante sem números (modo privacidade, relatório com valores ocultos, ADR-0032): só a quantidade de
 * medições no período. Nenhum peso, medida ou variação.
 */
export function bodyInsightsHidden({ records, range, today }: BodyInsightsInput): ModuleInsights {
  const base = { module: 'body' as const, highlights: [] };
  if (records.length === 0) return { ...base, state: 'empty', sentences: [sentence('empty')] };
  return {
    ...base,
    state: records.length < 2 ? 'partial' : 'ok',
    sentences: [
      sentence('hiddenCount', { ...periodArgs(range, today), count: int(records.length) }),
    ],
  };
}
