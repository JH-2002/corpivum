import { BODY_REGIONS, REGION_FIELD, type BodyRegion } from './regions';
import type { BodySnapshot } from './snapshot';

/**
 * Dimensões do manequim neutro usado quando a medida não foi informada. São só a geometria padrão do
 * desenho: nunca aparecem na interface e não são referência, meta nem faixa (ADR-0025, ADR-0026).
 */
const NEUTRAL_CM = Object.freeze({
  heightCm: 170,
  chest: 94,
  arm: 29,
  waist: 82,
  hip: 98,
  thigh: 55,
});

/** Limites do desenho (o número exibido continua o informado): mantêm o modelo legível. */
const HEIGHT_M: readonly [number, number] = [1.2, 2.2];
const GIRTH_CM: Readonly<Record<BodyRegion, readonly [number, number]>> = Object.freeze({
  chest: [55, 180],
  arm: [15, 60],
  waist: [45, 180],
  hip: [55, 180],
  thigh: [30, 100],
});

/** Profundidade do tronco em relação à largura (seção elíptica). */
export const TORSO_DEPTH_RATIO = 0.7;
/** Perímetro de uma elipse com eixos a e 0,7a, dividido por 2πa (Ramanujan). */
const ELLIPSE_PERIMETER_FACTOR = 0.8566;

export interface BodyShape {
  /** Altura do modelo, em metros (limitada ao intervalo do desenho). */
  heightM: number;
  /**
   * Semi-eixo horizontal (largura/2) de cada região, em metros. Tronco: seção elíptica com profundidade
   * `TORSO_DEPTH_RATIO`; braço e coxa: seção circular.
   */
  radius: Record<BodyRegion, number>;
  /** Regiões desenhadas na forma neutra por falta de medida informada. */
  missing: BodyRegion[];
  heightMissing: boolean;
}

const clamp = (v: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, v));

/** Raio (m) a partir da circunferência (cm): elipse no tronco, círculo nos membros. */
function radiusFor(region: BodyRegion, girthCm: number): number {
  const meters = clamp(girthCm, GIRTH_CM[region]) / 100;
  return region === 'arm' || region === 'thigh'
    ? meters / (2 * Math.PI)
    : meters / (2 * Math.PI * ELLIPSE_PERIMETER_FACTOR);
}

/**
 * Parâmetros do corpo 3D (§15) a partir SÓ das medidas informadas: altura e circunferências. O peso
 * não entra (não se infere forma a partir dele) e não há IMC nem classificação (LEG-M04, ADR-0026).
 */
export function bodyShape(snapshot: BodySnapshot): BodyShape {
  const height = snapshot.values.heightCm?.value;
  const missing: BodyRegion[] = [];
  const radius = {} as Record<BodyRegion, number>;
  for (const region of BODY_REGIONS) {
    const informed = snapshot.values[REGION_FIELD[region]]?.value;
    if (informed === undefined) missing.push(region);
    radius[region] = radiusFor(region, informed ?? NEUTRAL_CM[region]);
  }
  return {
    heightM: clamp((height ?? NEUTRAL_CM.heightCm) / 100, HEIGHT_M),
    radius,
    missing,
    heightMissing: height === undefined,
  };
}
