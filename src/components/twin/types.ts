import type { BodyRegion, BodyShape } from '@/modules/twin';

/** Ponteiro sobre uma região: posição na tela para o tooltip. */
export interface HoverInfo<R extends string> {
  region: R;
  clientX: number;
  clientY: number;
}

/** Propriedades comuns das cenas 3D (carregadas sob demanda, ADR-0026). */
export interface SceneCommon<R extends string> {
  /** Rotação em torno do eixo vertical (rad). */
  angle: number;
  /** Aplicar o ângulo sem transição (arrasto, reduced motion). */
  instant: boolean;
  selected: R | null;
  onSelect: (region: R) => void;
  onHover: (info: HoverInfo<R> | null) => void;
  /** Perda do contexto WebGL: a interface troca para a versão 2D. */
  onFail: () => void;
  compact: boolean;
}

export interface BodySceneProps extends SceneCommon<BodyRegion> {
  shape: BodyShape;
}
