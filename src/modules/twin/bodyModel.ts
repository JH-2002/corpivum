import { z } from 'zod';
import type { BodyCalibration } from './morph';
import type { BodyRegion } from './regions';

/**
 * Modelo de visualização do corpo 3D (ADR-0028): preferência de interface guardada só no navegador.
 * Muda apenas a aparência da malha; não entra em cálculo e não é dado de sexo ou gênero (ROPA T1). Sem padrão
 * assumido: até a pessoa escolher, não há modelo (o twin pergunta e mostra o corpo gerado em código).
 */
export const BODY_MODELS = ['feminine', 'masculine'] as const;
export type BodyModel = (typeof BODY_MODELS)[number];

export const BODY_MODEL_STORAGE_KEY = 'hm.twin.bodyModel';

const bodyModelSchema = z.enum(BODY_MODELS).nullable().catch(null);

/** Valor do storage → modelo escolhido; ausente, inválido ou de versão antiga ("neutral") = sem escolha. */
export function parseBodyModel(raw: unknown): BodyModel | null {
  return bodyModelSchema.parse(raw ?? null);
}

/**
 * Arquivo `.glb` de uma variante, gerado por `scripts/assets/pack-models.mjs` (ADR-0028). `file` é o
 * caminho público relativo (`/models/...`), servido pelo próprio app. `measure`: planos do protocolo de medição em
 * coordenadas do `.glb`, para o teste de geometria no CI (`scripts/assets/README.md`).
 */
export interface BodyAsset {
  file: `/models/${string}.glb`;
  bytes: number;
  sha256: string;
  triangles: number;
  calibration: BodyCalibration;
  measure: Record<BodyRegion, MeasurePlane>;
}

/**
 * Plano de uma circunferência: ponto, normal e ponto de referência do laço. `tape`: o que a fita enxerga (`arm`:
 * só a primitiva do braço; `body`: tudo menos ela, a fita passa por baixo dos braços). `loop`: `whole` abraça o
 * corte inteiro (peito e cintura, onde a axila pode partir o corte do tronco); `nearest`, o laço mais próximo de
 * `near`.
 */
export interface MeasurePlane {
  point: [number, number, number];
  normal: [number, number, number];
  near: [number, number, number];
  tape: 'arm' | 'body';
  loop: 'whole' | 'nearest';
}
