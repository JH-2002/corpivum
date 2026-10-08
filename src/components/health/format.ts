/** Formatação de valores de saúde para exibição (pt-BR). Funções puras. */

/** "7 h 25 min" a partir de minutos. */
export function formatDuration(minutes: number): string {
  const m = Math.round(Math.abs(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

export function formatDecimal(value: number, decimals = 1): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export type Trend = 'up' | 'down' | 'flat';

export function trendOf(delta: number | null, epsilon = 0): Trend | null {
  if (delta === null) return null;
  if (delta > epsilon) return 'up';
  if (delta < -epsilon) return 'down';
  return 'flat';
}

/** Seta textual da tendência (o texto ao lado diz o mesmo; a seta é apoio visual). */
export const TREND_ARROW: Record<Trend, string> = { up: '▲', down: '▼', flat: '■' };
