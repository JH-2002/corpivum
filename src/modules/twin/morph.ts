import { BODY_REGIONS, type BodyRegion } from './regions';
import type { BodyShape } from './shape';

/**
 * Calibração de um modelo `.glb` do corpo (ADR-0028), gerada pelo pipeline em `scripts/assets/`: a
 * circunferência medida na malha, em cm, com o morph `<região>_min` em 1, na forma base e com
 * `<região>_max` em 1. `baseHeightM` é a altura da malha base.
 */
export interface BodyCalibration {
  baseHeightM: number;
  girthCm: Record<BodyRegion, { min: number; base: number; max: number }>;
}

export type MorphName = `${BodyRegion}_${'min' | 'max'}`;

export const MORPH_NAMES: readonly MorphName[] = BODY_REGIONS.flatMap((r) => [
  `${r}_min` as const,
  `${r}_max` as const,
]);

export interface BodyMorph {
  /** Influência de cada morph target, sempre entre 0 e 1. */
  weights: Record<MorphName, number>;
  /** Escala uniforme para a altura informada. */
  scale: number;
}

const unit = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Influências dos morph targets a partir SÓ da forma (altura e circunferências já limitadas por
 * `bodyShape`). Não recebe peso: o peso nunca molda o corpo (LEG-M04, ADR-0026, ADR-0028). Região sem
 * medida informada fica na forma base da variante.
 */
export function bodyMorphWeights(shape: BodyShape, calibration: BodyCalibration): BodyMorph {
  const weights = {} as Record<MorphName, number>;
  for (const region of BODY_REGIONS) {
    const { min, base, max } = calibration.girthCm[region];
    const girth = shape.girthCm[region];
    const missing = shape.missing.includes(region);
    weights[`${region}_min`] = missing || girth >= base ? 0 : unit((base - girth) / (base - min));
    weights[`${region}_max`] = missing || girth <= base ? 0 : unit((girth - base) / (max - base));
  }
  // Sem altura informada, a altura da própria variante (nada vem da forma neutra do desenho em código).
  return { weights, scale: shape.heightMissing ? 1 : shape.heightM / calibration.baseHeightM };
}
