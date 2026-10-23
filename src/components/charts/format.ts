/** Formatação compartilhada dos gráficos (pt-BR). */

export function shortDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function formatNumber(value: number, decimals = 1): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/** Variação com sinal ("+1,2", "−0,4", "0"): o sinal de menos é o tipográfico, como no resto da tela. */
export function formatSigned(value: number, decimals = 1): string {
  const text = formatNumber(Math.abs(value), decimals);
  if (text === formatNumber(0, decimals)) return text;
  return `${value > 0 ? '+' : '−'}${text}`;
}

/** Valor de uma série numa linha de dados (objeto simples vindo do servidor). */
export function valueOf(row: object, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

/** Algum ponto com valor? Gráfico só é desenhado quando há dado (§34: nenhum gráfico vazio). */
export function hasValues(data: readonly object[], keys: readonly string[]): boolean {
  return data.some((row) => keys.some((k) => typeof valueOf(row, k) === 'number'));
}
