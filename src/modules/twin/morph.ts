import { BODY_REGIONS, type BodyRegion } from './regions';
import type { BodyShape } from './shape';

/**
 * Calibração de um modelo `.glb` do corpo (ADR-0028), gerada pelo pipeline em `scripts/assets/`: a
 * circunferência medida na malha, em cm, na forma base, com o morph regional `<região>_min`/`_max` em 1 e com
 * o morph global `size_min`/`size_max` em 1. `baseHeightM` é a altura da malha base.
 */
export interface BodyCalibration {
  baseHeightM: number;
  girthCm: Record<
    BodyRegion,
    { min: number; base: number; max: number; sizeMin: number; sizeMax: number }
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

export interface BodyMorph {
  /** Influência de cada morph target, entre 0 e o limite de `MORPH_LIMITS`. */
  weights: Record<MorphName, number>;
  /** Escala uniforme para a altura informada. */
  scale: number;
}

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));

/** Efeito (cm) do tamanho global `s` (positivo = maior) na circunferência de uma região. */
function sizeEffect(s: number, g: BodyCalibration['girthCm'][BodyRegion]): number {
  return s >= 0 ? s * (g.sizeMax - g.base) : s * (g.base - g.sizeMin);
}

/**
 * Influências dos morph targets a partir SÓ da forma (altura e circunferências já limitadas por
 * `bodyShape`). Não recebe peso: o peso nunca molda o corpo (LEG-M04, LEG-M06, ADR-0026, ADR-0028).
 * 1. Tamanho global: a média, nas regiões com medida informada, de quanto cada uma pede do morph `size_*`.
 * 2. Ajuste regional: o que falta em cada região vai para `<região>_min`/`_max`.
 * Região sem medida informada fica na circunferência base da variante (o ajuste regional compensa o tamanho
 * global); sem nenhuma medida, a forma base.
 */
export function bodyMorphWeights(shape: BodyShape, calibration: BodyCalibration): BodyMorph {
  const informed = BODY_REGIONS.filter((r) => !shape.missing.includes(r));
  const pulls = informed.map((r) => {
    const g = calibration.girthCm[r];
    const d = shape.girthCm[r] - g.base;
    return d >= 0 ? d / (g.sizeMax - g.base) : d / (g.base - g.sizeMin);
  });
  const mean = pulls.length ? pulls.reduce((a, b) => a + b, 0) / pulls.length : 0;
  const s = Math.max(-MORPH_LIMITS.sizeDown, Math.min(MORPH_LIMITS.sizeUp, mean));

  const weights = { size_min: Math.max(0, -s), size_max: Math.max(0, s) } as Record<
    MorphName,
    number
  >;
  for (const region of BODY_REGIONS) {
    const g = calibration.girthCm[region];
    const target = shape.missing.includes(region) ? g.base : shape.girthCm[region];
    const rest = target - (g.base + sizeEffect(s, g));
    weights[`${region}_max`] = rest > 0 ? clamp(rest / (g.max - g.base), MORPH_LIMITS.regionUp) : 0;
    weights[`${region}_min`] =
      rest < 0 ? clamp(-rest / (g.base - g.min), MORPH_LIMITS.regionDown) : 0;
  }
  // Sem altura informada, a altura da própria variante (nada vem da forma neutra do desenho em código).
  return { weights, scale: shape.heightMissing ? 1 : shape.heightM / calibration.baseHeightM };
}

/** Circunferência (cm) que o modelo desenha numa região com estes pesos (modelo linear dos morphs). */
export function modelGirthCm(
  weights: Record<MorphName, number>,
  calibration: BodyCalibration,
  region: BodyRegion,
): number {
  const g = calibration.girthCm[region];
  return (
    g.base +
    sizeEffect(weights.size_max - weights.size_min, g) +
    weights[`${region}_max`] * (g.max - g.base) -
    weights[`${region}_min`] * (g.base - g.min)
  );
}
