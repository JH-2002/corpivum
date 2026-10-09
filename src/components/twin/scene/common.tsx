'use client';

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Group } from 'three';
import { useTokenColor } from '../hooks';
import type { SceneCommon } from '../types';

/**
 * Canvas do twin (ADR-0026): renderiza só quando algo muda (`frameloop="demand"`), resolução limitada
 * no celular, sem mapa de ambiente nem asset externo, fundo transparente. A perda do contexto WebGL
 * chama `onFail` (a interface troca para 2D).
 */
export function TwinCanvas({
  compact,
  cameraZ,
  cameraY = 0,
  onFail,
  children,
}: {
  compact: boolean;
  cameraZ: number;
  cameraY?: number;
  onFail: () => void;
  children: ReactNode;
}) {
  return (
    <Canvas
      frameloop="demand"
      dpr={compact ? [1, 1.5] : [1, 2]}
      camera={{ position: [0, cameraY, cameraZ], fov: 35, near: 0.1, far: 50 }}
      gl={{ antialias: !compact, alpha: true, powerPreference: 'low-power' }}
      aria-hidden
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          onFail();
        });
      }}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[2, 3, 4]} intensity={1.6} />
      <directionalLight position={[-3, 1, -2]} intensity={0.6} />
      {children}
    </Canvas>
  );
}

/**
 * Gira o modelo até `angle`. Com `instant` (arrasto ou `prefers-reduced-motion`) aplica direto; senão,
 * aproxima em poucos quadros e para de renderizar ao chegar.
 */
export function Turntable({
  angle,
  instant,
  children,
}: {
  angle: number;
  instant: boolean;
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [angle, invalidate]);
  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const delta = angle - group.rotation.y;
    if (instant || Math.abs(delta) < 0.002) {
      group.rotation.y = angle;
      return;
    }
    group.rotation.y += delta * 0.2;
    invalidate();
  });
  return <group ref={ref}>{children}</group>;
}

/**
 * Cores do modelo a partir dos tokens: neutras (duas, só para separar regiões vizinhas) e de destaque só
 * na região escolhida. Nenhuma cor depende dos registros da pessoa (ADR-0026).
 */
export function useModelColors() {
  return {
    base: useTokenColor('--hm-neutral-400', '#8f9ba2'),
    alt: useTokenColor('--hm-neutral-300', '#bcc5ca'),
    selected: useTokenColor('--hm-primary', '#0b5c6e'),
  };
}

/** Clique só sem arrasto (o arrasto gira o modelo). */
const CLICK_SLOP_PX = 6;

/**
 * Eventos de ponteiro de uma região: clique seleciona; ao entrar na região, o tooltip aparece no ponto
 * de entrada (sem re-render a cada movimento).
 */
export function regionHandlers<R extends string>(
  region: R,
  { onSelect, onHover }: Pick<SceneCommon<R>, 'onSelect' | 'onHover'>,
) {
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta > CLICK_SLOP_PX) return;
      onSelect(region);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onHover({ region, clientX: e.nativeEvent.clientX, clientY: e.nativeEvent.clientY });
    },
    onPointerOut: () => onHover(null),
  };
}
