'use client';

import { useThree } from '@react-three/fiber';
import { use, useLayoutEffect, useMemo, useRef } from 'react';
import type { Mesh } from 'three';
import { bodyMorphWeights, type BodyAsset, type BodyRegion } from '@/modules/twin';
import type { BodySceneProps } from '../types';
import { loadBodyParts, type BodyPart } from './assets';
import { regionHandlers } from './common';
import { HologramMaterial, regionHoloState, useHoloTheme } from './Hologram';

/**
 * Corpo `.glb` da variante (ADR-0028). A forma vem SÓ das medidas informadas: os pesos dos morphs saem
 * de `bodyMorphWeights` (sem peso corporal, sem IMC) e a altura informada vira escala uniforme. Região sem
 * medida fica na forma base da variante, esmaecida. Suspende enquanto o arquivo carrega.
 */
export function BodyModelMesh(props: BodySceneProps & { asset: BodyAsset }) {
  const { asset, shape, selected, model } = props;
  const parts = use(loadBodyParts(asset));
  const morph = useMemo(() => bodyMorphWeights(shape, asset.calibration), [shape, asset]);
  const theme = useHoloTheme();
  const get = useThree((s) => s.get);

  useLayoutEffect(() => {
    const { gl, invalidate } = get();
    gl.domElement.dataset.twinModel = model;
    invalidate();
  }, [get, model]);

  const height = asset.calibration.baseHeightM * morph.scale;
  return (
    <group position={[0, -height / 2, 0]} scale={morph.scale}>
      {parts.map((part, i) => (
        <BodyPartMesh
          key={i}
          part={part}
          weights={morph.weights}
          state={regionHoloState(part.region, selected, shape.missing)}
          theme={theme}
          handlers={part.region ? regionHandlers<BodyRegion>(part.region, props) : undefined}
        />
      ))}
    </group>
  );
}

function BodyPartMesh({
  part,
  weights,
  state,
  theme,
  handlers,
}: {
  part: BodyPart;
  weights: Record<string, number>;
  state: ReturnType<typeof regionHoloState>;
  theme: ReturnType<typeof useHoloTheme>;
  handlers: ReturnType<typeof regionHandlers<BodyRegion>> | undefined;
}) {
  const ref = useRef<Mesh>(null);
  const invalidate = useThree((s) => s.invalidate);

  // A geometria é compartilhada (cache); cada malha tem as próprias influências.
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    if (!mesh.morphTargetInfluences) mesh.updateMorphTargets();
    const influences = mesh.morphTargetInfluences ?? [];
    for (const [name, index] of Object.entries(part.morphs)) influences[index] = weights[name] ?? 0;
    invalidate();
  }, [part, weights, invalidate]);

  return (
    <mesh
      ref={ref}
      geometry={part.geometry}
      matrix={part.matrix}
      matrixAutoUpdate={false}
      frustumCulled={false}
      {...handlers}
    >
      <HologramMaterial theme={theme} state={state} />
    </mesh>
  );
}
