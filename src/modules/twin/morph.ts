import { BODY_REGIONS, type BodyRegion } from './regions';
import type { BodyShape } from './shape';

type RegionalMorph = `${BodyRegion}_${'min' | 'max'}`;
type Vec3 = [number, number, number];

/**
 * Calibração de um modelo `.glb` do corpo (ADR-0028), medida pelo pipeline na malha final (a que a pessoa vê),
 * pelo protocolo de medição de `scripts/assets/README.md`: circunferência em cm de cada região na forma base, com
 * o morph regional da própria região em 1 (`min`/`max`), com o morph global de tamanho em 1 (`sizeMin`/`sizeMax`)
 * e com o morph de OUTRA região em 1 (`cross`, só os efeitos acima de 0,05 cm). `baseHeightM`: altura da base.
 * `armAxis`: direção do úmero (coordenadas do `.glb`), para a escala da altura no braço.
 */
export interface BodyCalibration {
  baseHeightM: number;
  armAxis?: Vec3;
  girthCm: Record<
    BodyRegion,
    {
      min: number;
      base: number;
      max: number;
      sizeMin: number;
      sizeMax: number;
      cross?: Partial<Record<RegionalMorph, number>>;
    }
  >;
}

export type MorphName = `${BodyRegion | 'size'}_${'min' | 'max'}`;

export const MORPH_NAMES: readonly MorphName[] = [...BODY_REGIONS, 'size' as const].flatMap((r) => [
  `${r}_min` as const,
  `${r}_max` as const,
]);

/**
 * Até quanto cada morph pode ser extrapolado sem deformar o corpo (conferido nos renders do pipeline). Acima
 * disso, a forma fica no limite e o número exibido continua o informado (ADR-0026).
 */
export const MORPH_LIMITS = Object.freeze({ sizeUp: 3, sizeDown: 2, regionUp: 1.5, regionDown: 1 });

/** Tolerância entre a circunferência desenhada e a informada (plano aprovado): máx(1,0 cm; 2%). */
export const drawnTolerance = (cm: number) => Math.max(1, 0.02 * cm);

/**
 * Altura informada: escala vertical cheia; na horizontal, só a raiz dela (uma pessoa mais alta não é
 * proporcionalmente mais larga). As circunferências seguem as medidas pelos morphs.
 */
const WIDTH_EXPONENT = 0.5;

export interface BodyMorph {
  /** Influência de cada morph target, entre 0 e o limite de `MORPH_LIMITS`. */
  weights: Record<MorphName, number>;
  /** Escala do modelo pela altura informada, em x, y (vertical) e z do `.glb`. */
  scale: Vec3;
}

type Girth = BodyCalibration['girthCm'][BodyRegion];

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
const SOLVER_ITERATIONS = 30;
const SIZE_SEARCH_ITERATIONS = 24;

/** Escala (largura, altura) do modelo para a altura informada; sem altura, a da própria variante. */
function heightScale(
  shape: BodyShape,
  calibration: BodyCalibration,
): { width: number; height: number } {
  if (shape.heightMissing) return { width: 1, height: 1 };
  const height = shape.heightM / calibration.baseHeightM;
  return { width: height ** WIDTH_EXPONENT, height };
}

/**
 * Quanto a escala da altura multiplica a circunferência de uma região. Tronco e coxa são medidos em plano
 * horizontal (fator = largura). O braço é medido perpendicular ao úmero, inclinado: o corte de um cilindro ao
 * longo de `a` sob a escala S = diag(w, h, w) tem área multiplicada por det(S)/|S·a|, e o perímetro pela raiz disso.
 */
function girthFactor(
  region: BodyRegion,
  scale: { width: number; height: number },
  calibration: BodyCalibration,
): number {
  const { width: w, height: h } = scale;
  if (region !== 'arm' || !calibration.armAxis) return w;
  const [x, y, z] = calibration.armAxis;
  const length = Math.hypot(x, y, z);
  const stretched = Math.hypot((w * x) / length, (h * y) / length, (w * z) / length);
  return Math.sqrt((w * w * h) / stretched);
}

/** Efeito (cm) do tamanho global `s` (positivo = maior) na circunferência de uma região. */
function sizeEffect(s: number, g: Girth): number {
  return s >= 0 ? s * (g.sizeMax - g.base) : s * (g.base - g.sizeMin);
}

/** Efeito (cm) dos morphs das OUTRAS regiões na circunferência de `region`. */
function crossEffect(weights: Record<MorphName, number>, g: Girth, region: BodyRegion): number {
  let total = 0;
  for (const other of BODY_REGIONS) {
    if (other === region) continue;
    for (const side of ['min', 'max'] as const) {
      const at = g.cross?.[`${other}_${side}`];
      if (at !== undefined) total += weights[`${other}_${side}`] * (at - g.base);
    }
  }
  return total;
}

/**
 * Tamanho global por mínimos quadrados: o `s` que melhor explica as diferenças das regiões medidas, pesando
 * cada uma pelo efeito que o tamanho tem nela (um braço maior não infla o tronco).
 */
function globalSize(diffs: { d: number; g: Girth }[]): number {
  const fit = (delta: (g: Girth) => number) => {
    const num = diffs.reduce((sum, { d, g }) => sum + d * delta(g), 0);
    const den = diffs.reduce((sum, { g }) => sum + delta(g) ** 2, 0);
    return den > 0 ? num / den : 0;
  };
  const up = fit((g) => g.sizeMax - g.base);
  if (up > 0) return Math.min(MORPH_LIMITS.sizeUp, up);
  const down = fit((g) => g.base - g.sizeMin);
  return down < 0 ? Math.max(-MORPH_LIMITS.sizeDown, down) : 0;
}

/**
 * Influências dos morph targets a partir SÓ da forma (altura e circunferências já limitadas por
 * `bodyShape`). Não recebe peso: o peso nunca molda o corpo (LEG-M04, LEG-M06, ADR-0026, ADR-0028).
 * 1. Escala pela altura informada; a meta de cada região na malha é a circunferência informada dividida pelo
 *    quanto a escala a multiplica (`girthFactor`).
 * 2. Tamanho global por mínimos quadrados nas regiões com medida informada.
 * 3. Ajuste regional, resolvido junto (Gauss-Seidel) com o efeito de cada morph nas outras regiões.
 * Região sem medida informada mira a circunferência base da variante (enquanto os limites permitem); sem
 * nenhuma medida, a forma base.
 */
export function bodyMorphWeights(shape: BodyShape, calibration: BodyCalibration): BodyMorph {
  const scale = heightScale(shape, calibration);
  const target = (region: BodyRegion) =>
    shape.missing.includes(region)
      ? calibration.girthCm[region].base
      : shape.girthCm[region] / girthFactor(region, scale, calibration);

  const informed = BODY_REGIONS.filter((r) => !shape.missing.includes(r));
  const solveAt = (s: number) => {
    const weights = Object.fromEntries(MORPH_NAMES.map((n) => [n, 0])) as Record<MorphName, number>;
    weights.size_max = Math.max(0, s);
    weights.size_min = Math.max(0, -s);
    for (let i = 0; i < SOLVER_ITERATIONS; i++) {
      for (const region of BODY_REGIONS) {
        const g = calibration.girthCm[region];
        const rest = target(region) - (g.base + sizeEffect(s, g) + crossEffect(weights, g, region));
        weights[`${region}_max`] =
          rest > 0 ? clamp(rest / (g.max - g.base), MORPH_LIMITS.regionUp) : 0;
        weights[`${region}_min`] =
          rest < 0 ? clamp(-rest / (g.base - g.min), MORPH_LIMITS.regionDown) : 0;
      }
    }
    const error = Math.max(
      0,
      ...informed.map((r) => Math.abs(modelGirthCm(weights, calibration, r) - target(r))),
    );
    return { weights, error };
  };

  // Tamanho global: o ótimo de mínimos quadrados; se alguma região medida não fecha (ajuste regional no
  // limite), busca entre 0 e ele o tamanho que minimiza o maior erro (ex.: quadril grande não engorda a coxa).
  const s0 = globalSize(
    informed.map((r) => ({
      d: target(r) - calibration.girthCm[r].base,
      g: calibration.girthCm[r],
    })),
  );
  let best = solveAt(s0);
  if (best.error > 0.1 && s0 !== 0) {
    let lo = Math.min(0, s0);
    let hi = Math.max(0, s0);
    for (let i = 0; i < SIZE_SEARCH_ITERATIONS; i++) {
      const a = lo + (hi - lo) / 3;
      const b = hi - (hi - lo) / 3;
      if (solveAt(a).error <= solveAt(b).error) hi = b;
      else lo = a;
    }
    const searched = solveAt((lo + hi) / 2);
    if (searched.error < best.error) best = searched;
  }
  return { weights: best.weights, scale: [scale.width, scale.height, scale.width] };
}

/** Circunferência (cm) que a malha desenha numa região com estes pesos, antes da escala da altura. */
export function modelGirthCm(
  weights: Record<MorphName, number>,
  calibration: BodyCalibration,
  region: BodyRegion,
): number {
  const g = calibration.girthCm[region];
  return (
    g.base +
    sizeEffect(weights.size_max - weights.size_min, g) +
    crossEffect(weights, g, region) +
    weights[`${region}_max`] * (g.max - g.base) -
    weights[`${region}_min`] * (g.base - g.min)
  );
}

/** Circunferências (cm) que o modelo desenha para esta forma, já com a escala da altura. */
export function drawnGirthsCm(
  shape: BodyShape,
  calibration: BodyCalibration,
): Record<BodyRegion, number> {
  const { weights } = bodyMorphWeights(shape, calibration);
  const scale = heightScale(shape, calibration);
  return Object.fromEntries(
    BODY_REGIONS.map((r) => [
      r,
      girthFactor(r, scale, calibration) * modelGirthCm(weights, calibration, r),
    ]),
  ) as Record<BodyRegion, number>;
}

/**
 * Regiões com medida informada que o desenho não alcança dentro da tolerância (além dos limites dos morphs):
 * o painel avisa, em texto e sem número, que o modelo mostra o limite e o número é o informado.
 */
export function outOfDrawingRange(shape: BodyShape, calibration: BodyCalibration): BodyRegion[] {
  const drawn = drawnGirthsCm(shape, calibration);
  return BODY_REGIONS.filter(
    (region) =>
      !shape.missing.includes(region) &&
      Math.abs(drawn[region] - shape.girthCm[region]) > drawnTolerance(shape.girthCm[region]),
  );
}
