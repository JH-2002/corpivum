'use client';

import { useMemo } from 'react';
import { Vector2 } from 'three';
import type { BodyRegion } from '@/modules/twin';
import { bodyLayout, type ProfilePoint } from '../layout';
import type { BodySceneProps } from '../types';
import { regionHandlers, TwinCanvas, Turntable } from './common';
import { HologramMaterial, useHoloTheme } from './Hologram';

const toVectors = (points: readonly ProfilePoint[]) => points.map(([r, y]) => new Vector2(r, y));

/**
 * Corpo 3D paramétrico (§15, ADR-0026): manequim neutro gerado em código, com o material holográfico
 * (ADR-0028). A forma vem só das medidas informadas; regiões sem medida ficam na forma neutra, mais
 * transparentes. Nenhuma cor vem de dado; o destaque marca só a região escolhida.
 */
export function BodyScene(props: BodySceneProps) {
  const { shape, angle, instant, selected, compact, onFail } = props;
  const layout = useMemo(() => bodyLayout(shape), [shape]);
  const theme = useHoloTheme();
  const segments = compact ? 24 : 48;
  const missing = new Set(shape.missing);

  const material = (region: BodyRegion | null) => (
    <HologramMaterial
      theme={theme}
      state={
        region !== null && region === selected
          ? 'selected'
          : region !== null && missing.has(region)
            ? 'dimmed'
            : 'base'
      }
    />
  );
  const handlers = (region: BodyRegion) => regionHandlers(region, props);
  const legHeight = layout.leg.top - layout.leg.bottom;
  const legY = (layout.leg.top + layout.leg.bottom) / 2;

  return (
    <TwinCanvas compact={compact} cameraZ={3.6} onFail={onFail}>
      <Turntable angle={angle} instant={instant}>
        <group position={[0, -layout.height / 2, 0]}>
          {(['hip', 'waist', 'chest'] as const).map((band) => (
            <mesh key={band} scale={[1, 1, layout.depth]} {...handlers(band)}>
              <latheGeometry args={[toVectors(layout.torso[band]), segments]} />
              {material(band)}
            </mesh>
          ))}
          {[-1, 1].map((side) => (
            <mesh
              key={`leg${side}`}
              position={[side * layout.leg.x, legY, 0]}
              {...handlers('thigh')}
            >
              <cylinderGeometry
                args={[layout.leg.rTop, layout.leg.rBottom, legHeight, segments / 2]}
              />
              {material('thigh')}
            </mesh>
          ))}
          {[-1, 1].map((side) => (
            <mesh
              key={`arm${side}`}
              position={[
                side * (layout.arm.x + Math.sin(layout.arm.tilt) * (layout.arm.length / 2)),
                layout.arm.top - layout.arm.length / 2,
                0,
              ]}
              rotation={[0, 0, side * layout.arm.tilt]}
              {...handlers('arm')}
            >
              <capsuleGeometry args={[layout.arm.r, layout.arm.length, 6, segments / 2]} />
              {material('arm')}
            </mesh>
          ))}
          <mesh position={[0, (layout.neck.bottom + layout.neck.top) / 2, 0]}>
            <cylinderGeometry
              args={[layout.neck.r, layout.neck.r, layout.neck.top - layout.neck.bottom, 16]}
            />
            {material(null)}
          </mesh>
          <mesh position={[0, layout.head.y, 0]} scale={[0.85, 1, 0.95]}>
            <sphereGeometry args={[layout.head.r, segments / 2, segments / 2]} />
            {material(null)}
          </mesh>
          {[-1, 1].map((side) => (
            <mesh
              key={`foot${side}`}
              position={[side * layout.leg.x, layout.leg.bottom * 0.6, layout.leg.rBottom]}
              scale={[1, 0.6, 2]}
            >
              <sphereGeometry args={[layout.leg.rBottom * 1.1, 12, 12]} />
              {material(null)}
            </mesh>
          ))}
        </group>
      </Turntable>
    </TwinCanvas>
  );
}
