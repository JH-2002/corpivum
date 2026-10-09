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
