'use client';

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Group } from 'three';
import type { SceneCommon } from '../types';
import { HoloClock } from './Hologram';

/**
 * Canvas do twin (ADR-0026, ADR-0028): renderiza só quando algo muda (`frameloop="demand"`, mais a
 * varredura do holograma quando há movimento), resolução limitada no celular, sem luz nem mapa de
 * ambiente (o material holográfico não usa iluminação), fundo transparente. Perda e restauração do
 * contexto WebGL são avisadas à cena (`preventDefault` permite ao navegador restaurar o contexto).
 */
export function TwinCanvas({
  compact,
  cameraZ,
  cameraY = 0,
  onContextLost,
  onContextRestored,
  children,
}: {
  compact: boolean;
  cameraZ: number;
  cameraY?: number;
  onContextLost: () => void;
  onContextRestored: () => void;
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
          onContextLost();
        });
        gl.domElement.addEventListener('webglcontextrestored', () => onContextRestored());
      }}
    >
      <HoloClock />
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
