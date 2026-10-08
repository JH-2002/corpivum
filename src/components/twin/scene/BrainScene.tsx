'use client';

import { useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute, SphereGeometry } from 'three';
import { brainLobeAt, type BrainRegion } from '@/modules/twin';
import type { BrainSceneProps } from '../types';
import { regionHandlers, TwinCanvas, Turntable, useModelColors } from './common';

type Lobe = Exclude<BrainRegion, 'cerebellum' | 'brainstem'>;
const LOBES: readonly Lobe[] = ['frontal', 'parietal', 'temporal', 'occipital'];
/** Regiões no tom neutro alternativo, para separar vizinhas sem significar nada. */
const ALT_TONE: ReadonlySet<BrainRegion> = new Set(['parietal', 'temporal', 'brainstem']);

/** Semi-eixos de cada hemisfério e afastamento do centro. */
const HEMI = { sx: 0.58, sy: 0.66, sz: 0.95, offset: 0.6 };

/** Relevo estilizado (determinístico): só estética, igual para todas as pessoas. */
const bump = (x: number, y: number, z: number) =>
  1 + 0.035 * Math.sin(9 * x) * Math.sin(11 * y) * Math.sin(7 * z);

/**
 * Divide a esfera de um hemisfério em lobos pelo centro de cada triângulo (`brainLobeAt`), aplica o
 * relevo e a escala. Geometria gerada em código, sem modelo externo (docs/ASSETS.md).
 */
function hemisphere(side: 1 | -1, detail: number): Record<Lobe, BufferGeometry> {
  const source = new SphereGeometry(1, detail * 1.5, detail).toNonIndexed();
  const pos = source.getAttribute('position');
  const buckets: Record<Lobe, number[]> = {
    frontal: [],
    parietal: [],
    temporal: [],
    occipital: [],
  };
  for (let i = 0; i < pos.count; i += 3) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      cx += pos.getX(i + k) / 3;
      cy += pos.getY(i + k) / 3;
      cz += pos.getZ(i + k) / 3;
    }
    const lobe = brainLobeAt({ outward: side * cx, y: cy, z: cz });
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(i + k);
      const y = pos.getY(i + k);
      const z = pos.getZ(i + k);
      const b = bump(x, y, z);
      buckets[lobe].push(x * b * HEMI.sx + side * HEMI.offset, y * b * HEMI.sy, z * b * HEMI.sz);
    }
  }
  source.dispose();
  const out = {} as Record<Lobe, BufferGeometry>;
  for (const lobe of LOBES) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(buckets[lobe], 3));
    g.computeVertexNormals();
    out[lobe] = g;
  }
  return out;
}

/**
 * Cérebro 3D educativo (§17, LEG-M05): estilizado, igual para todas as pessoas. Regiões clicáveis; a
 * cor nunca muda com os registros da pessoa, só destaca a região escolhida.
 */
export function BrainScene(props: BrainSceneProps) {
  const { angle, instant, selected, compact, onFail } = props;
  const detail = compact ? 24 : 40;
  const halves = useMemo(() => [hemisphere(-1, detail), hemisphere(1, detail)], [detail]);
  const colors = useModelColors();
  const material = (region: BrainRegion) => (
    <meshStandardMaterial
      color={
        region === selected ? colors.selected : ALT_TONE.has(region) ? colors.alt : colors.base
      }
      roughness={0.6}
      metalness={0.05}
      flatShading
    />
  );
  const handlers = (region: BrainRegion) => regionHandlers(region, props);

  return (
    <TwinCanvas compact={compact} cameraZ={4.4} cameraY={0.2} onFail={onFail}>
      <Turntable angle={angle} instant={instant}>
        <group position={[0, 0.2, 0]}>
          {LOBES.map((lobe) => (
            <group key={lobe} {...handlers(lobe)}>
              {halves.map((half, i) => (
                <mesh key={i} geometry={half[lobe]}>
                  {material(lobe)}
                </mesh>
              ))}
            </group>
          ))}
          <mesh position={[0, -0.62, -0.6]} scale={[0.75, 0.36, 0.45]} {...handlers('cerebellum')}>
            <sphereGeometry args={[1, detail, detail / 2]} />
            {material('cerebellum')}
          </mesh>
          <mesh position={[0, -0.92, -0.22]} rotation={[0.3, 0, 0]} {...handlers('brainstem')}>
            <cylinderGeometry args={[0.15, 0.11, 0.75, detail / 2]} />
            {material('brainstem')}
          </mesh>
        </group>
      </Turntable>
    </TwinCanvas>
  );
}
