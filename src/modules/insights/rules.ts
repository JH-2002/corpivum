import { rangeLength } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import type { DayStyle, InsightArg, InsightArgs, InsightSentence } from './types';

/**
 * Limiares da camada explicativa (ADR-0025). Comparações só com o próprio histórico da pessoa (período
 * anterior de mesmo tamanho) e com a frequência prevista dos hábitos; nunca com faixa populacional ou
 * clínica. Mudar um limiar muda o texto: atualize os testes.
 */
export const INSIGHT_RULES = Object.freeze({
  /** Registros mínimos no período (e no anterior, para comparar). */
  minRecords: 3,
  /** Diferença de sono médio (min) a partir da qual o texto fala em "a mais / a menos". */
  sleepMinutes: 20,
  /** Diferença de cumprimento de hábitos (fração, 0,1 = 10 pontos percentuais). */
  habitPoints: 0.1,
  /** Variação média de horário de sono (min) abaixo da qual o texto diz "horários parecidos". */
  scheduleSteadyMinutes: 15,
  /** Variação de peso (kg) abaixo da qual o texto diz "ficou estável". */
  weightKg: 0.5,
  /** Máximo de frases no resumo. */
  maxSentences: 4,
});

export const int = (value: number): InsightArg => ({ kind: 'int', value: Math.round(value) });
export const decimal = (value: number): InsightArg => ({ kind: 'decimal', value });
export const signed = (value: number): InsightArg => ({ kind: 'signed', value });
export const duration = (value: number): InsightArg => ({ kind: 'duration', value });
export const select = (value: string): InsightArg => ({ kind: 'select', value });

export function sentence(key: string, args: InsightArgs = {}): InsightSentence {
  return { key, args };
}

/** Dias da semana para períodos de até 7 dias (sem ambiguidade); senão, a data. */
export function dayStyle(range: DateRange): DayStyle {
  return rangeLength(range) <= 7 ? 'weekday' : 'date';
}

export function days(value: string[], range: DateRange): InsightArg {
  return { kind: 'days', value, style: dayStyle(range) };
}

/**
 * Argumentos do período: `recent` ("nos últimos N dias", quando termina hoje) e `days` (tamanho, que
 * também nomeia o período anterior: 7 → "semana anterior").
 */
export function periodArgs(
  range: DateRange,
  today: string,
): { recent: InsightArg; days: InsightArg } {
  return { recent: select(range.to === today ? 'yes' : 'no'), days: int(rangeLength(range)) };
}

/**
 * Dias com o menor ou o maior valor (empates na ordem do calendário), até `n`. Ignora dias sem valor.
 */
export function extremeDays(
  rows: ReadonlyArray<{ day: string; value: number | null }>,
  which: 'min' | 'max',
  n = 1,
): string[] {
  const withValue = rows.filter((r): r is { day: string; value: number } => r.value !== null);
  const sorted = [...withValue].sort((a, b) =>
    a.value === b.value
      ? a.day.localeCompare(b.day)
      : which === 'min'
        ? a.value - b.value
        : b.value - a.value,
  );
  return sorted
    .slice(0, n)
    .map((r) => r.day)
    .sort();
}

/** Corta no máximo de frases, preservando a ordem de prioridade recebida. */
export function cap(sentences: Array<InsightSentence | null>): InsightSentence[] {
  return sentences
    .filter((s): s is InsightSentence => s !== null)
    .slice(0, INSIGHT_RULES.maxSentences);
}
