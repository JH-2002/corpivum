import { z } from 'zod';

/**
 * Modelo de visualização do corpo 3D (ADR-0028): preferência de interface guardada só no navegador.
 * Muda apenas a aparência da malha; não entra em cálculo e não é dado de sexo ou gênero (ROPA T1).
 */
export const BODY_MODELS = ['neutral', 'feminine', 'masculine'] as const;
export type BodyModel = (typeof BODY_MODELS)[number];

export const DEFAULT_BODY_MODEL: BodyModel = 'neutral';
export const BODY_MODEL_STORAGE_KEY = 'hm.twin.bodyModel';

const bodyModelSchema = z.enum(BODY_MODELS).catch(DEFAULT_BODY_MODEL);

/** Valor do storage → modelo válido; ausente ou inválido = neutro. */
export function parseBodyModel(raw: unknown): BodyModel {
  return bodyModelSchema.parse(raw);
}
