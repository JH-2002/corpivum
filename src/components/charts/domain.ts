/** Domínio e rótulos do eixo Y dos gráficos. Funções puras. */

export interface PaddedDomainOptions {
  /** Faixa mínima do eixo, centrada na média (ex.: 4 = ±2 kg). */
  minSpan: number;
  /** Folga em cada ponta quando os dados excedem a faixa mínima (fração da amplitude). */
  pad?: number;
  /** Passo mínimo dos tiques; os limites são arredondados para fora, em múltiplos do passo. */
  step?: number;
}

/** Até 4 intervalos entre tiques. */
const MAX_INTERVALS = 4;

/** Passo "redondo" (1, 2 ou 5 × 10^n) para cobrir `span` em até 4 intervalos, nunca menor que `min`. */
export function niceStep(span: number, min = 0): number {
  const raw = Math.max(span / MAX_INTERVALS, min, Number.EPSILON);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw - 1e-9)!;
  return Math.max(nice, min);
}

/** Tiques de `lo` a `hi` (inclusive) num passo redondo: nenhum tique avulso no topo. */
export function niceTicks([lo, hi]: [number, number]): number[] {
  const step = niceStep(hi - lo);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/**
 * Domínio do eixo Y com faixa mínima em torno da média: variações pequenas não ocupam o gráfico inteiro e não
 * parecem grandes (LEG-M06). Se os dados excedem a faixa, ela se ajusta aos dados com uma folga. Nunca vai
 * abaixo de zero quando todos os valores são positivos. Sem nenhum valor, `undefined` (o eixo fica automático).
 */
export function paddedDomain(
  values: ReadonlyArray<number | null | undefined>,
  { minSpan, pad = 0.1, step = 1 }: PaddedDomainOptions,
): [number, number] | undefined {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return undefined;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  let lo: number;
  let hi: number;
  if (max - min <= minSpan) {
    const mean = nums.reduce((acc, v) => acc + v, 0) / nums.length;
    lo = mean - minSpan / 2;
    hi = mean + minSpan / 2;
    // A média pode ficar longe do centro dos extremos: a faixa desliza para conter todos os valores.
    if (min < lo) [lo, hi] = [min, min + minSpan];
    if (max > hi) [lo, hi] = [max - minSpan, max];
  } else {
    const extra = (max - min) * pad;
    lo = min - extra;
    hi = max + extra;
  }
  if (min >= 0) lo = Math.max(0, lo);
  // Limites em múltiplos de um passo redondo: os tiques caem certinhos nas pontas (72, 74, 76, 78).
  let tick = niceStep(hi - lo, step);
  let [a, b] = [Math.floor(lo / tick) * tick, Math.ceil(hi / tick) * tick];
  // Arredondar para fora pode pedir um passo maior (mais de 4 intervalos).
  while ((b - a) / tick > MAX_INTERVALS + 1e-9) {
    tick = niceStep(b - a, tick * 1.0001);
    [a, b] = [Math.floor(lo / tick) * tick, Math.ceil(hi / tick) * tick];
  }
  return [a, b];
}

/** Largura do eixo Y (px) para caber o maior rótulo formatado, com piso de 44 px. */
export function axisWidth(labels: readonly string[], minWidth = 44): number {
  const longest = labels.reduce((acc, l) => Math.max(acc, l.length), 0);
  // ~7,5 px por caractere a 12 px (Inter, números tabulares) + espaço do traço do eixo.
  return Math.max(minWidth, Math.ceil(longest * 7.5 + 14));
}

type AxisDomain = [number | 'auto', number | 'auto'];

export interface AxisSeries {
  key: string;
  kind: 'line' | 'bar';
  axis?: 'left' | 'right';
  decimals?: number;
  integer?: boolean;
}

export interface YAxisConfig {
  domain: AxisDomain;
  /** Tiques explícitos quando o domínio é fixo (o recharts dividiria em passos quebrados). */
  ticks?: number[];
  allowDecimals: boolean;
  decimals: number;
  width: number;
}

/**
 * Configuração de um eixo Y a partir das séries visíveis nele:
 * - com barra, o domínio começa em zero (o comprimento da barra é o valor), ignorando `domain`;
 * - só contagens (`integer`), o eixo não mostra decimais;
 * - a largura cabe o maior rótulo formatado em pt-BR (nada de "73,95" virar "3,95").
 */
export function yAxisConfig(
  data: readonly object[],
  series: readonly AxisSeries[],
  axis: 'left' | 'right',
  domain: [number, number] | undefined,
  format: (value: number, decimals: number) => string,
): YAxisConfig {
  const onAxis = series.filter((s) => (s.axis ?? 'left') === axis);
  const integer = onAxis.length > 0 && onAxis.every((s) => s.integer);
  const decimals = integer ? 0 : Math.max(0, ...onAxis.map((s) => s.decimals ?? 1));
  const hasBar = onAxis.some((s) => s.kind === 'bar');
  const fixed = hasBar ? undefined : domain;
  const values = data.flatMap((row) =>
    onAxis
      .map((s) => (row as Record<string, unknown>)[s.key])
      .filter((v): v is number => typeof v === 'number'),
  );
  const extremes = [...values, ...(domain ?? [])];
  const labels = extremes.length
    ? [format(Math.min(...extremes), decimals), format(Math.max(...extremes), decimals)]
    : [];
  return {
    domain: hasBar ? [0, 'auto'] : (fixed ?? ['auto', 'auto']),
    ticks: fixed ? niceTicks(fixed) : undefined,
    allowDecimals: !integer,
    decimals,
    width: axisWidth(labels),
  };
}
