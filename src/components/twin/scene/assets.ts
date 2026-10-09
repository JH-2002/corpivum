import { Mesh, type BufferGeometry, type Matrix4 } from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BODY_REGIONS, type BodyAsset, type BodyRegion } from '@/modules/twin';

/**
 * Único ponto que carrega arquivo 3D (ADR-0028, teste de fronteira): só `.glb` do próprio app em
 * `/models/` (LEG-S10), comprimidos com meshopt (decodificador embutido no three, sem arquivo externo).
 * Cada primitiva do modelo é uma região (material `region_<região>`; `region_rest` = sem região).
 */
export interface BodyPart {
  region: BodyRegion | null;
  geometry: BufferGeometry;
  /** Transformação do nó (inclui a desquantização das posições feita pelo gltfpack). */
  matrix: Matrix4;
  /** Nome do morph → índice (vem de `extras.targetNames`; fica na malha, não na geometria). */
  morphs: Record<string, number>;
}

const MODEL_PATH = /^\/models\/[a-z0-9-]+\.[0-9a-f]{8}\.glb$/;
const cache = new Map<string, Promise<BodyPart[]>>();

const regionOf = (material: string): BodyRegion | null =>
  BODY_REGIONS.find((r) => material === `region_${r}`) ?? null;

/** Partes do corpo de um `.glb`, carregadas uma vez por arquivo (Antes × Agora compartilha a geometria). */
export function loadBodyParts(asset: BodyAsset): Promise<BodyPart[]> {
  const cached = cache.get(asset.file);
  if (cached) return cached;
  if (!MODEL_PATH.test(asset.file)) return Promise.reject(new Error('caminho de modelo inválido'));
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const promise = loader.loadAsync(asset.file).then((gltf) => {
    gltf.scene.updateMatrixWorld(true);
    const parts: BodyPart[] = [];
    gltf.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const material = Array.isArray(node.material) ? node.material[0] : node.material;
      parts.push({
        region: regionOf(material?.name ?? ''),
        geometry: node.geometry as BufferGeometry,
        matrix: node.matrixWorld.clone(),
        morphs: { ...node.morphTargetDictionary },
      });
      material?.dispose();
    });
    if (parts.length === 0) throw new Error('modelo sem malhas');
    return parts;
  });
  cache.set(asset.file, promise);
  return promise;
}
