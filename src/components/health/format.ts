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

/** Unidade de cada medida do corpo: fonte única para valores exibidos, gráficos e campos. */
export const MEASURE_UNITS = {
  weightKg: 'kg',
  heightCm: 'cm',
  waistCm: 'cm',
  hipCm: 'cm',
  armCm: 'cm',
  thighCm: 'cm',
  chestCm: 'cm',
  bodyFatPct: '%',
} as const;

export type MeasureUnit = (typeof MEASURE_UNITS)[keyof typeof MEASURE_UNITS] | 'ml' | 'kcal';

/** "73,9 kg", "18%": número e unidade sempre juntos (nenhuma medida sem unidade na tela). */
export function formatMeasure(value: number, unit: MeasureUnit, decimals = 1): string {
  const n = formatDecimal(value, decimals);
  return unit === '%' ? `${n}%` : `${n} ${unit}`;
}

/** Como `formatMeasure`, com sinal explícito: "+0,4 kg", "−1,2 cm". */
export function formatSignedMeasure(value: number, unit: MeasureUnit, decimals = 1): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatMeasure(Math.abs(value), unit, decimals)}`;
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
