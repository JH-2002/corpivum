// ARQUIVO (ADR-0045): estudo descartado; o logo oficial é a imagem original. Rodar a partir da raiz do repositório.
// Uso: node scripts/brand/arquivo/perfil-modelos.mjs [saida.json]
// Extrai o perfil frontal (meia-largura por altura) dos dois modelos do twin e tira a média.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const repo = process.cwd();
const out = process.argv[2] ?? 'capturas/logo/arquivo/perfil.json';
mkdirSync(path.dirname(out), { recursive: true });

const N = 480;
// Máscara frontal: rasteriza cada triângulo projetado em XY (vista de frente, ortográfica).
const ROWS = 480,
  COLS = 320; // COLS cobre |x| <= 0.33 * altura (espelhado)
async function profile(file) {
  const buf = readFileSync(path.join(repo, 'public', 'models', file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(ab, '');
  gltf.scene.updateMatrixWorld(true);
  const tris = [];
  const v = new THREE.Vector3();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const P = [];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      P.push([v.x, v.y]);
    }
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx.getX(i) : i,
        b = idx ? idx.getX(i + 1) : i + 1,
        c = idx ? idx.getX(i + 2) : i + 2;
      tris.push([P[a], P[b], P[c]]);
    }
  });
  let [minY, maxY, minX, maxX] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const t of tris)
    for (const [x, y] of t) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  const cx = (minX + maxX) / 2,
    h = maxY - minY,
    XR = 0.33;
  const mask = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
  for (const t of tris) {
    // espelha: rasteriza o triângulo nos dois lados e junta em |x|
    for (const sgn of [1, -1]) {
      const q = t.map(([x, y]) => [((maxY - y) / h) * ROWS, (((x - cx) * sgn) / h / XR) * COLS]);
      const r0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[0])))),
        r1 = Math.min(ROWS - 1, Math.ceil(Math.max(...q.map((p) => p[0]))));
      const c0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[1])))),
        c1 = Math.min(COLS - 1, Math.ceil(Math.max(...q.map((p) => p[1]))));
      const [A, B, C] = q;
      const d = (B[0] - C[0]) * (A[1] - C[1]) + (C[1] - B[1]) * (A[0] - C[0]);
      if (Math.abs(d) < 1e-12) continue;
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const pr = r + 0.5,
            pc = c + 0.5;
          const l1 = ((B[0] - C[0]) * (pc - C[1]) + (C[1] - B[1]) * (pr - C[0])) / d;
          const l2 = ((C[0] - A[0]) * (pc - C[1]) + (A[1] - C[1]) * (pr - C[0])) / d;
          if (l1 >= 0 && l2 >= 0 && 1 - l1 - l2 >= 0) mask[r][c] = 1;
        }
    }
  }
  // Por linha: trechos contínuos a partir do centro.
  const half = mask.map((row) => {
    const runs = [];
    let s = -1;
    for (let c = 0; c <= COLS; c++) {
      const on = c < COLS && row[c];
      if (on && s < 0) s = c;
      if (!on && s >= 0) {
        runs.push([s, c]);
        s = -1;
      }
    }
    const k = (c) => (c / COLS) * XR;
    const core = runs[0] ? k(runs[0][1]) : 0;
    const coreStart = runs[0] ? k(runs[0][0]) : 0;
    const arm = runs.length > 1 ? k(runs.at(-1)[1] - runs.at(-1)[0]) : 0;
    return { core, coreStart, arm };
  });
  console.log(file, { triangulos: tris.length, altura: h.toFixed(3) });
  return half;
}

const f = await profile('body-feminine.00e6a01a.glb');
const m = await profile('body-masculine.a82ae25d.glb');
const avg = f.map((a, i) => ({
  core: (a.core + m[i].core) / 2,
  coreStart: (a.coreStart + m[i].coreStart) / 2,
  arm: (a.arm + m[i].arm) / 2,
}));
writeFileSync(out, JSON.stringify({ N, feminino: f, masculino: m, media: avg }));
for (let i = 0; i < N; i += 12) {
  const bar = (x, c) => c.repeat(Math.round(x * 200));
  console.log(
    String((i / N).toFixed(2)).padStart(5),
    avg[i].core.toFixed(3),
    avg[i].arm.toFixed(3),
    avg[i].coreStart.toFixed(3),
    ' '.repeat(Math.round(avg[i].coreStart * 200)) +
      bar(avg[i].core - avg[i].coreStart, '#') +
      bar(avg[i].arm, '='),
  );
}
