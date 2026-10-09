import type { BodyField } from '@/modules/body';
import type { JournalTag } from '@/modules/journal';

/**
 * Camada explicativa por regras (ADR-0025). As funções deste módulo devolvem CHAVES do i18n
 * (`insights.<módulo>.*`) e argumentos tipados; o texto final é montado na interface. Nenhum argumento
 * carrega conteúdo livre (nota, texto do diário, nome de hábito): só números, dias, etiquetas fixas e
 * campos fixos.
 */
export type InsightModule = 'dashboard' | 'sleep' | 'mood' | 'habits' | 'journal' | 'body' | 'twin';

/** Argumento de uma frase, com o formato que a interface deve aplicar. */
export type InsightArg =
  | { kind: 'int'; value: number }
  | { kind: 'decimal'; value: number }
  /** Variação com sinal explícito ("+1,2" / "−0,8"). */
  | { kind: 'signed'; value: number }
  /** Minutos, exibidos como duração ("6 h 40 min"). */
  | { kind: 'duration'; value: number }
  /** Dias `YYYY-MM-DD`, exibidos pelo dia da semana (períodos de até 7 dias) ou pela data. */
  | { kind: 'days'; value: string[]; style: DayStyle }
  | { kind: 'tag'; value: JournalTag }
  | { kind: 'field'; value: BodyField }
  /** Valor para `select` do ICU (ex.: `recent`). */
  | { kind: 'select'; value: string };

export type DayStyle = 'weekday' | 'date';

export type InsightArgs = Record<string, InsightArg>;

export interface InsightSentence {
  key: string;
  args: InsightArgs;
}

/** Estado do resumo: sem registro no período, poucos registros, ou amostra suficiente. */
export type InsightState = 'empty' | 'partial' | 'ok';

export interface Highlight {
  /** Chave do rótulo em `insights.<módulo>.highlights.*`. */
  key: string;
  value: InsightArg;
  /** Detalhe opcional (chave em `insights.<módulo>.highlights.*`). */
  detail?: InsightSentence;
  /** Selo do valor (antes da troca por DEMO na interface). */
  level: 'INFORMADO' | 'ESTIMADO';
}

export interface ModuleInsights {
  module: InsightModule;
  state: InsightState;
  /** Frases do resumo, na ordem de leitura. 2 a 4 quando `ok`; `MAX_SENTENCES` no máximo. */
  sentences: InsightSentence[];
  highlights: Highlight[];
  /**
   * Humor baixo, queda relevante ou registro no ponto mais baixo da escala: a interface mostra a
   * orientação de apoio (CVV 188 / SAMU 192, §48) junto do resumo. Não é avaliação de risco.
   */
  supportSignal: boolean;
}
