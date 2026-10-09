import { Mesh, type BufferGeometry, type Matrix4 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BODY_REGIONS, type BodyAsset, type BodyRegion } from '@/modules/twin';

/**
 * Único ponto que carrega arquivo 3D (ADR-0028, teste de fronteira; único `fetch` das cenas): só `.glb` do próprio app em
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
  // Sem cookie (PR3b-M1): o arquivo é público e o pedido não precisa nem deve ser ligado à conta.
  const promise = Promise.all([
    fetch(asset.file, { credentials: 'omit' }).then((res) => {
      if (!res.ok) throw new Error('modelo indisponível');
      return res.arrayBuffer();
    }),
    // O decodificador compila WebAssembly ao carregar: importado só quando há modelo, que é quando a CSP
    // inclui 'wasm-unsafe-eval' (PR3b-B1).
    import('three/addons/libs/meshopt_decoder.module.js'),
  ])
    .then(([data, { MeshoptDecoder }]) =>
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data, ''),
    )
    .then((gltf) => {
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
