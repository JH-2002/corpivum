import { Mesh, type BufferGeometry, type Matrix4 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BODY_REGIONS, type BodyAsset, type BodyRegion } from '@/modules/twin';
import { BODY_ASSETS } from '@/modules/twin/bodyAssets';

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
/** Chegada de cada arquivo pela rede, antes da decodificação: o tempo limite da cena mede só isso (`bodyModelArrived`). */
const arrivals = new Map<string, Promise<void>>();

const regionOf = (material: string): BodyRegion | null =>
  BODY_REGIONS.find((r) => material === `region_${r}`) ?? null;

/** Partes do corpo de um `.glb`, carregadas uma vez por arquivo (Antes × Agora compartilha a geometria). */
export function loadBodyParts(asset: BodyAsset): Promise<BodyPart[]> {
  const cached = cache.get(asset.file);
  if (cached) return cached;
  if (!MODEL_PATH.test(asset.file)) return Promise.reject(new Error('caminho de modelo inválido'));
  // Sem cookie (PR3b-M1): o arquivo é público e o pedido não precisa nem deve ser ligado à conta.
  const bytes = fetch(asset.file, { credentials: 'omit' }).then((res) => {
    if (!res.ok) throw new Error('modelo indisponível');
    return res.arrayBuffer();
  });
  // Só o sinal de chegada, não os bytes: o buffer fica livre depois da decodificação.
  arrivals.set(
    asset.file,
    bytes.then(() => undefined),
  );
  const promise = Promise.all([
    bytes,
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

/**
 * Resolve quando o arquivo chega pela rede, antes da decodificação e do envio à GPU. Com WebGL por software ou
 * CPU ocupada, decodificar demora sem que falte nada: o tempo limite da cena (`MODEL_LOAD_TIMEOUT_MS`) vale
 * só para a espera pela rede. Falha de rede ou de decodificação chega pela própria `loadBodyParts`.
 */
export function bodyModelArrived(asset: BodyAsset): Promise<void> {
  void loadBodyParts(asset).catch(() => undefined);
  return arrivals.get(asset.file) ?? Promise.reject(new Error('caminho de modelo inválido'));
}

/**
 * Pede todos os modelos de uma vez, qualquer que seja a variante escolhida (OI-24(e)): pelos pedidos, o
 * servidor nunca sabe qual corpo a pessoa vê. A escolha fica só no navegador.
 */
export function preloadAllBodyModels(): void {
  for (const asset of Object.values(BODY_ASSETS)) {
    // A falha de um modelo não escolhido não aparece; a do escolhido cai no fallback da cena.
    if (asset) loadBodyParts(asset).catch(() => undefined);
  }
}
