import type { BodyField } from '@/modules/body';

/**
 * Regiões clicáveis do corpo 3D (§15). Cada uma corresponde a UMA medida informada; o peso não é região
 * e nunca altera a forma (ADR-0026).
 */
export const BODY_REGIONS = ['chest', 'arm', 'waist', 'hip', 'thigh'] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];

export const REGION_FIELD: Readonly<Record<BodyRegion, BodyField>> = Object.freeze({
  chest: 'chestCm',
  arm: 'armCm',
  waist: 'waistCm',
  hip: 'hipCm',
  thigh: 'thighCm',
});

/** Medidas que entram na forma do modelo (altura + circunferências). Sem peso, sem % de gordura. */
export const SHAPE_FIELDS: readonly BodyField[] = ['heightCm', ...Object.values(REGION_FIELD)];

/** Medidas comparadas no Antes × Agora (§16): o peso aparece só em número. */
export const COMPARE_FIELDS: readonly BodyField[] = ['weightKg', ...SHAPE_FIELDS];

/** Temas do app que a pessoa registra e que o conteúdo educativo associa a regiões (§17). */
export const BRAIN_THEMES = ['sleep', 'mood', 'habits'] as const;
export type BrainTheme = (typeof BRAIN_THEMES)[number];

/**
 * Regiões do cérebro estilizado (§17), com os temas que o texto educativo associa a cada uma. O modelo
 * é igual para todas as pessoas e nunca muda de cor ou forma com os registros (LEG-M05).
 */
export const BRAIN_REGIONS = [
  'frontal',
  'parietal',
  'temporal',
  'occipital',
  'cerebellum',
  'brainstem',
] as const;
export type BrainRegion = (typeof BRAIN_REGIONS)[number];

export const BRAIN_REGION_THEMES: Readonly<Record<BrainRegion, readonly BrainTheme[]>> =
  Object.freeze({
    frontal: ['sleep', 'mood', 'habits'],
    parietal: [],
    temporal: ['sleep', 'mood'],
    occipital: [],
    cerebellum: [],
    brainstem: ['sleep'],
  });

/**
 * Lobo de um ponto da superfície de um hemisfério (esfera unitária, frente = +z, cima = +y).
 * `outward` é a coordenada x para fora do hemisfério (positiva na face lateral). Divisão estilizada,
 * só para desenhar o modelo educativo; não é mapa anatômico.
 */
export function brainLobeAt(p: {
  outward: number;
  y: number;
  z: number;
}): Exclude<BrainRegion, 'cerebellum' | 'brainstem'> {
  if (p.z < -0.55) return 'occipital';
  if (p.y < -0.1 && p.outward > 0.35 && p.z < 0.6) return 'temporal';
  if (p.z > 0.25) return 'frontal';
  return 'parietal';
}
