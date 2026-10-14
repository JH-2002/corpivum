import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Mesh, Vector3, type BufferAttribute, type Matrix4 } from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { BodyAsset, MeasurePlane, MorphName } from '@/modules/twin';

/**
 * Geometria real dos modelos `.glb` para os testes (ADR-0028, seção 8 da especificação do twin): aplica os pesos
 * dos morphs como o three faz (base + Σ peso × delta, depois a matriz do nó) e mede a circunferência pelo
 * protocolo do pipeline (scripts/assets/README.md): fita do plano (só o braço ou tudo menos ele), corte pelo plano,
 * laço mais próximo do ponto de referência ou, no peito e na cintura, o corte inteiro (a axila pode partir o corte
 * do tronco), perímetro do fecho convexo.
 */
export interface Part {
  material: string;
  base: BufferAttribute;
  deltas: { name: string; attr: BufferAttribute }[];
  index: ArrayLike<number> | null;
  matrix: Matrix4;
}

const ROOT = path.resolve(__dirname, '../..');

export async function loadBody(asset: BodyAsset): Promise<Part[]> {
  const bytes = readFileSync(path.join(ROOT, 'public', asset.file));
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  await MeshoptDecoder.ready;
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data, '');
  gltf.scene.updateMatrixWorld(true);
  const parts: Part[] = [];
  gltf.scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const geometry = node.geometry;
    const names = Object.entries(node.morphTargetDictionary ?? {});
    const morphs = (geometry.morphAttributes.position ?? []) as BufferAttribute[];
    const material = Array.isArray(node.material) ? node.material[0] : node.material;
    parts.push({
      material: material?.name ?? '',
      base: geometry.getAttribute('position') as BufferAttribute,
      deltas: names.map(([name, i]) => ({ name, attr: morphs[i]! })),
      index: geometry.index ? geometry.index.array : null,
      matrix: node.matrixWorld.clone(),
    });
  });
  return parts;
}

/** Posições finais de cada parte (metros), com os pesos e a escala da altura. */
export function positions(
  parts: Part[],
  weights: Record<MorphName, number>,
  scale: Vector3,
): Vector3[][] {
  return parts.map((part) => {
    const out: Vector3[] = [];
    const v = new Vector3();
    for (let i = 0; i < part.base.count; i++) {
      v.fromBufferAttribute(part.base, i);
      for (const { name, attr } of part.deltas) {
        const w = weights[name as MorphName] ?? 0;
        if (w) {
          v.x += w * attr.getX(i);
          v.y += w * attr.getY(i);
          v.z += w * attr.getZ(i);
        }
      }
      out.push(v.clone().applyMatrix4(part.matrix).multiply(scale));
    }
    return out;
  });
}

function hullPerimeter(points: [number, number][]): number {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return 0;
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
  const half = (list: [number, number][]) => {
    const h: [number, number][] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  const hull = [...half(pts), ...half([...pts].reverse())];
  let total = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

/** Circunferência (cm) da malha com estes pesos no plano dado (plano e referência escalados junto). */
export function measureGirth(
  parts: Part[],
  weights: Record<MorphName, number>,
  scale: [number, number, number],
  plane: MeasurePlane,
): number {
  // Escala por eixo (altura): ponto e referência acompanham; a normal é o eixo medido (úmero ou vertical)
  // depois da escala, como a fita perpendicular ao braço da pessoa.
  const s = new Vector3(...scale);
  const point = new Vector3(...plane.point).multiply(s);
  const near = new Vector3(...plane.near).multiply(s);
  const normal = new Vector3(...plane.normal).multiply(s).normalize();
  // Fita: só a primitiva do braço, ou todas menos ela (a fita do tronco passa por baixo dos braços).
  const taped = parts.filter((part) => (part.material === 'region_arm') === (plane.tape === 'arm'));
  const all = positions(taped, weights, s);

  // Pontos de corte nas arestas; arestas iguais (também entre primitivas, na costura) ligam os segmentos.
  const key = (p: Vector3) =>
    `${Math.round(p.x * 2000)},${Math.round(p.y * 2000)},${Math.round(p.z * 2000)}`;
  const parent = new Map<string, string>();
  const coords = new Map<string, Vector3>();
  const find = (k: string): string => {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(k, root);
    return root;
  };
  const add = (p: Vector3) => {
    const k = key(p);
    if (!parent.has(k)) {
      parent.set(k, k);
      coords.set(k, p);
    }
    return k;
  };
  taped.forEach((part, pi) => {
    const pos = all[pi]!;
    const count = part.index ? part.index.length : pos.length;
    for (let t = 0; t < count; t += 3) {
      const ids = [0, 1, 2].map((j) => (part.index ? part.index[t + j]! : t + j));
      const verts = ids.map((id) => pos[id]!);
      const dist = verts.map((p) => p.clone().sub(point).dot(normal));
      const hits: string[] = [];
      for (const [a, b] of [
        [0, 1],
        [1, 2],
        [2, 0],
      ] as const) {
        if (dist[a]! > 0 !== dist[b]! > 0) {
          const f = dist[a]! / (dist[a]! - dist[b]!);
          hits.push(add(verts[a]!.clone().lerp(verts[b]!, f)));
        }
      }
      if (hits.length === 2) parent.set(find(hits[0]!), find(hits[1]!));
    }
  });

  const loops = new Map<string, Vector3[]>();
  for (const k of parent.keys()) {
    const root = find(k);
    if (!loops.has(root)) loops.set(root, []);
    loops.get(root)!.push(coords.get(k)!);
  }
  const real = [...loops.values()].filter((loop) => loop.length >= 3);
  let best: Vector3[] = [];
  if (plane.loop === 'whole') {
    best = real.flat();
  } else {
    let bestDist = Infinity;
    for (const loop of real) {
      const c = loop.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(loop.length);
      const d = c.distanceTo(near);
      if (d < bestDist) {
        bestDist = d;
        best = loop;
      }
    }
  }
  const u = new Vector3(1, 0, 0);
  if (Math.abs(u.dot(normal)) > 0.9) u.set(0, 1, 0);
  u.sub(normal.clone().multiplyScalar(u.dot(normal))).normalize();
  const w = normal.clone().cross(u);
  return (
    100 * hullPerimeter(best.map((p) => [p.clone().sub(point).dot(u), p.clone().sub(point).dot(w)]))
  );
}
