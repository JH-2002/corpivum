// ARQUIVO (ADR-0045): estudo descartado; o logo oficial é a imagem original. Rodar a partir da raiz do repositório.
// Uso: node scripts/brand/arquivo/gerar-simbolo-simples.mjs [perfil.json] [pasta]
// Gera os SVGs da marca a partir do perfil frontal médio dos modelos do twin (perfil.json).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const perfilPath = process.argv[2] ?? 'capturas/logo/arquivo/perfil.json';
const brandDir = process.argv[3] ?? 'capturas/logo/arquivo';
mkdirSync(brandDir, { recursive: true });
const { N, media } = JSON.parse(readFileSync(perfilPath, 'utf8'));

// ---- 1. Perfil (meia-largura / altura) com braços encostados ao tronco ----
const T_END = 0.6; // corta nas coxas
const raw = media.map((r) => r.core + r.arm); // braço colado: tronco + espessura do braço

// suavização gaussiana
const smooth = (arr, sigma) =>
  arr.map((_, i) => {
    let s = 0,
      w = 0;
    for (let k = -3 * sigma; k <= 3 * sigma; k++) {
      const j = i + k;
      if (j < 0 || j >= arr.length) continue;
      const g = Math.exp(-(k * k) / (2 * sigma * sigma));
      s += arr[j] * g;
      w += g;
    }
    return s / w;
  });
let prof = smooth(raw, 3);

// Sem cintura: abaixo do ombro, o contorno nunca entra para dentro da reta ombro → quadril,
// e o quadril fica um pouco mais estreito que o ombro.
const idx = (t) => Math.min(N - 1, Math.round(t * N));
const iShoulder = (() => {
  let b = idx(0.18);
  for (let i = idx(0.18); i < idx(0.32); i++) if (prof[i] > prof[b]) b = i;
  return b;
})();
const iHip = idx(0.56);
const wS = prof[iShoulder];
const wH = wS / 1.13; // ombro ~13% mais largo que o quadril
for (let i = iShoulder; i <= idx(T_END); i++) {
  const u = Math.min(1, (i - iShoulder) / (iHip - iShoulder));
  const line = wS + (wH - wS) * u;
  prof[i] = i <= iHip ? line : wH; // reta suave ombro→quadril, depois reto até o corte
}
prof = smooth(prof, 4);

// ---- 2. Pontos de controle e Bézier (Catmull-Rom → cúbica) ----
// Figura ~18% maior que a anterior (470): ocupa a altura interna do "C", base cortada pelo anel.
// XS alarga só o corpo (não a cabeça) para os ombros lerem como ombros a 64 px.
const SCALE = 555,
  CX = 262,
  Y0 = 118,
  XS = 1.1;
// Cabeça: elipse com a largura real média do modelo (máx. do perfil até o queixo), ~15% mais destacada.
const iChin = idx(0.12);
const headHalf = Math.max(...prof.slice(0, iChin)) * 1.15;
const HC = 0.062,
  HB = 0.064; // centro e semi-altura da cabeça (fração da altura)
const right = [];
for (let k = 0; k <= 8; k++) {
  const a = (Math.PI / 2) * (k / 8); // do topo (0) ao lado (π/2) e além, até perto do queixo
  right.push([headHalf * Math.sin(a) * SCALE, Y0 + (HC - HB * Math.cos(a)) * SCALE]);
}
for (let k = 1; k <= 5; k++) {
  const a = Math.PI / 2 + (Math.PI / 2.6) * (k / 5);
  right.push([headHalf * Math.sin(a) * SCALE, Y0 + (HC - HB * Math.cos(a)) * SCALE]);
}
const neck = Math.max(prof[idx(0.14)], headHalf * 0.62);
right.push([neck * SCALE, Y0 + 0.145 * SCALE]);
for (let t = 0.17; t <= 0.3; t += 0.02) right.push([prof[idx(t)] * SCALE * XS, Y0 + t * SCALE]);
for (let t = 0.34; t <= T_END + 1e-9; t += 0.045)
  right.push([prof[idx(t)] * SCALE * XS, Y0 + t * SCALE]);

const f = (n) => Math.round(n * 10) / 10;
function catmull(points) {
  let d = '';
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)],
      p1 = points[i],
      p2 = points[i + 1],
      p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}
const R = right.map(([x, y]) => [CX + x, y]);
const L = [...right].reverse().map(([x, y]) => [CX - x, y]);
const bottom = Y0 + T_END * SCALE;
const figura = `M ${f(CX)} ${Y0}${catmull(R)} L ${f(CX - right.at(-1)[0])} ${f(bottom)}${catmull(L)} Z`;

// Linha interna do braço (separa braço e tronco, só como traço sutil)
const armIn = [];
for (let t = 0.31; t <= 0.53; t += 0.03) {
  const r = media[idx(t)];
  armIn.push([r.core * SCALE * XS, Y0 + t * SCALE]);
}
const armSm = armIn.map(([x, y], i, a) => [
  ((a[i - 1]?.[0] ?? x) + x + (a[i + 1]?.[0] ?? x)) / 3,
  y,
]);
const linhaBraco = (sgn) => `M ${armSm.map(([x, y]) => `${f(CX + sgn * x)} ${f(y)}`).join(' L ')}`;

console.log({ ombro: f(wS * SCALE * XS * 2), quadril: f(wH * SCALE * XS * 2), pontos: R.length });

// ---- 3. "C" com pontas cortadas na horizontal (anel levemente excêntrico, como na referência) ----
const anel = 'M 417.5 138 A 200 200 0 1 0 417.5 374 L 360.6 374 A 150 150 0 1 1 360.6 138 Z';

const defs = `
    <linearGradient id="anel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6fd0ff"/>
      <stop offset="1" stop-color="#1f6fe8"/>
    </linearGradient>
    <linearGradient id="luz" gradientUnits="userSpaceOnUse" x1="0" y1="118" x2="0" y2="400">
      <stop offset="0" stop-color="#8fdcff"/>
      <stop offset="1" stop-color="#2f7fe8"/>
    </linearGradient>
    <linearGradient id="sombra" gradientUnits="userSpaceOnUse" x1="0" y1="118" x2="0" y2="400">
      <stop offset="0" stop-color="#123a63"/>
      <stop offset="1" stop-color="#0a1f3a"/>
    </linearGradient>
    <clipPath id="interior"><circle cx="264" cy="256" r="141"/></clipPath>
    <clipPath id="metade-esq"><rect x="0" y="0" width="${CX - 1.5}" height="512"/></clipPath>
    <clipPath id="metade-dir"><rect x="${CX + 1.5}" y="0" width="${512 - CX}" height="512"/></clipPath>`;

const simbolo = `
  <!-- "C": pontas cortadas na horizontal -->
  <path d="${anel}" fill="url(#anel)"/>
  <!-- Figura: contorno frontal médio dos modelos feminino e masculino do twin, simplificado.
       Braços junto ao corpo, ombro um pouco mais largo que o quadril, sem cintura marcada,
       sem musculatura e sem gênero marcado (LEG-M06). Metade em sombra, metade em luz. -->
  <g clip-path="url(#interior)">
    <g clip-path="url(#metade-esq)">
      <path d="${figura}" fill="url(#sombra)" stroke="#6fd0ff" stroke-width="5" stroke-linejoin="round"/>
      <path d="${linhaBraco(-1)}" fill="none" stroke="#6fd0ff" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
    </g>
    <g clip-path="url(#metade-dir)">
      <path d="${figura}" fill="url(#luz)"/>
      <path d="${linhaBraco(1)}" fill="none" stroke="#0a1f3a" stroke-width="3" stroke-linecap="round" opacity="0.45"/>
    </g>
  </g>`;

const texto = `
  <!-- "CORPIVUM" desenhado em traços vetoriais (não depende de fonte) -->
  <g transform="translate(52 590) scale(0.95)" fill="none" stroke="url(#texto)" stroke-width="13" stroke-linejoin="round">
    <path d="M 103 7 H 45 A 38 43 0 0 0 45 93 H 103"/>
    <path transform="translate(138 0)" d="M 45 7 H 75 A 38 43 0 0 1 75 93 H 45 A 38 43 0 0 1 45 7 Z"/>
    <path transform="translate(286 0)" d="M 7 93 V 7 H 62 A 24 21.5 0 0 1 62 50 H 7 M 52 50 L 92 93"/>
    <path transform="translate(414 0)" d="M 7 93 V 7 H 62 A 24 21.5 0 0 1 62 50 H 7"/>
    <path transform="translate(535 0)" d="M 7 7 V 93"/>
    <path transform="translate(577 0)" d="M 7 7 L 50 93 L 93 7"/>
    <path transform="translate(705 0)" d="M 7 7 V 50 A 43 43 0 0 0 93 50 V 7"/>
    <path transform="translate(833 0)" d="M 7 93 V 7 L 55 70 L 103 7 V 93"/>
  </g>`;

const head = (vb) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-labelledby="t">\n  <title id="t">Corpivum</title>`;

writeFileSync(
  path.join(brandDir, 'corpivum-simbolo.svg'),
  `${head('0 0 512 512')}\n  <defs>${defs}\n  </defs>${simbolo}\n</svg>\n`,
);
writeFileSync(
  path.join(brandDir, 'corpivum-logo.svg'),
  `${head('0 0 1000 720')}\n  <defs>${defs}
    <linearGradient id="texto" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
      <stop offset="0" stop-color="#f4f8fc"/>
      <stop offset="1" stop-color="#c9d4e0"/>
    </linearGradient>
  </defs>
  <!-- Símbolo (mesmo desenho de corpivum-simbolo.svg) -->
  <g transform="translate(244 0)">${simbolo.replace(/\n/g, '\n  ')}
  </g>${texto}\n</svg>\n`,
);
writeFileSync(
  path.join(brandDir, 'corpivum-favicon.svg'),
  `${head('0 0 64 64')}
  <!-- Versão mínima para 16–32 px: só o "C" e um ponto no centro (cabeça), sem a figura -->
  <rect width="64" height="64" rx="14" fill="#0b1118"/>
  <path d="M 53.2 17 A 26 26 0 1 0 53.2 47 L 40.4 47 A 16.5 16.5 0 1 1 40.4 17 Z" fill="#2f9bff"/>
  <circle cx="33" cy="32" r="6.5" fill="#8fdcff"/>
</svg>\n`,
);
console.log('ok');
