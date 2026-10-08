import { TORSO_DEPTH_RATIO, type BodyRegion, type BodyShape } from '@/modules/twin';

/**
 * Proporções do manequim neutro (frações da altura, a partir do chão). Usadas pelo corpo 3D e pela
 * versão 2D, para que as duas mostrem a mesma forma (ADR-0026).
 */
const Y = Object.freeze({
  ankle: 0.045,
  crotch: 0.47,
  hip: 0.52,
  hipTop: 0.565,
  waist: 0.61,
  waistTop: 0.665,
  chest: 0.72,
  shoulder: 0.79,
  neckBase: 0.825,
  neckTop: 0.87,
  head: 0.93,
});

export type ProfilePoint = readonly [radius: number, y: number];

export interface BodyLayout {
  height: number;
  /** Perfis de revolução das três faixas do tronco (raio horizontal, altura), de baixo para cima. */
  torso: Record<'hip' | 'waist' | 'chest', ProfilePoint[]>;
  /** Fator de profundidade do tronco (seção elíptica). */
  depth: number;
  leg: { x: number; top: number; bottom: number; rTop: number; rBottom: number };
  arm: { x: number; top: number; length: number; r: number; tilt: number };
  neck: { r: number; bottom: number; top: number };
  head: { r: number; y: number };
}

const mid = (a: number, b: number) => (a + b) / 2;

export function bodyLayout(shape: BodyShape): BodyLayout {
  const h = shape.heightM;
  const r = shape.radius;
  const y = (k: keyof typeof Y) => Y[k] * h;
  const neckR = 0.028 * h;
  const hipWaist = mid(r.hip, r.waist);
  const waistChest = mid(r.waist, r.chest);
  return {
    height: h,
    depth: TORSO_DEPTH_RATIO,
    torso: {
      hip: [
        [0, y('crotch')],
        [r.hip * 0.82, y('crotch')],
        [r.hip, y('hip')],
        [hipWaist, y('hipTop')],
      ],
      waist: [
        [hipWaist, y('hipTop')],
        [r.waist, y('waist')],
        [waistChest, y('waistTop')],
      ],
      chest: [
        [waistChest, y('waistTop')],
        [r.chest, y('chest')],
        [r.chest * 0.92, y('shoulder')],
        [r.chest * 0.55, mid(y('shoulder'), y('neckBase'))],
        [neckR, y('neckBase')],
        [0, y('neckBase')],
      ],
    },
    leg: {
      x: r.hip * 0.48,
      top: y('crotch') + 0.04 * h,
      bottom: y('ankle'),
      rTop: r.thigh,
      rBottom: Math.max(0.025, r.thigh * 0.42),
    },
    arm: {
      x: r.chest * 0.95 + r.arm,
      top: y('shoulder') - r.arm,
      length: 0.34 * h,
      r: r.arm,
      tilt: 0.1,
    },
    neck: { r: neckR, bottom: y('neckBase'), top: y('neckTop') },
    head: { r: 0.062 * h, y: y('head') },
  };
}

/** Regiões do corpo na ordem da lista (de cima para baixo). */
export const BODY_REGION_ORDER: readonly BodyRegion[] = ['chest', 'arm', 'waist', 'hip', 'thigh'];

/** Ângulo (rad, em torno do eixo vertical) de cada vista. */
export const VIEW_ANGLE = Object.freeze({ front: 0, side: Math.PI / 2, back: Math.PI });
export type TwinView = keyof typeof VIEW_ANGLE;
export const TWIN_VIEWS: readonly TwinView[] = ['front', 'back', 'side'];

/** Vista mais próxima de um ângulo qualquer (para a versão 2D e para marcar o botão da vista). */
export function nearestView(angle: number): TwinView {
  const a = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (a < Math.PI / 4 || a >= (7 * Math.PI) / 4) return 'front';
  if (a >= (3 * Math.PI) / 4 && a < (5 * Math.PI) / 4) return 'back';
  return 'side';
}

/** Ângulo equivalente a `target` mais próximo de `current` (o modelo gira pelo caminho curto). */
export function closestAngle(current: number, target: number): number {
  const turn = 2 * Math.PI;
  return target + Math.round((current - target) / turn) * turn;
}
