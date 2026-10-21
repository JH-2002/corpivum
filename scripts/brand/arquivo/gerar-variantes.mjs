// ARQUIVO (ADR-0045): estudo descartado; o logo oficial é a imagem original. Rodar a partir da raiz do repositório.
// Uso: node scripts/brand/arquivo/gerar-variantes.mjs [pasta]
// Gera a variante "fiel à referência" (A) do símbolo. A variante B (neutra) foi descartada antes desta versão.
// Coordenadas normalizadas medidas na referência com grade: centro do "C" = (0,0), raio externo = 1.
// Viewbox 512, raio 240.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const brandDir = process.argv[2] ?? 'capturas/logo/arquivo';
mkdirSync(brandDir, { recursive: true });
const RO = 240,
  C0 = 256;
const P = ([x, y]) => [C0 + x * RO, C0 + y * RO];
const f = (n) => Math.round(n * 10) / 10;
const xy = (p) => `${f(p[0])} ${f(p[1])}`;
const mir = (pts, sgn) => pts.map(([x, y]) => [x * sgn, y]);

function catmull(pts) {
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${xy(c1)} ${xy(c2)} ${xy(p2)}`;
  }
  return d;
}
// Amostra a curva Catmull-Rom (para afinar as linhas de luz).
function sample(pts, per = 12) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per,
        t2 = t * t,
        t3 = t2 * t;
      out.push(
        [0, 1].map(
          (j) =>
            0.5 *
            (2 * p1[j] +
              (-p0[j] + p2[j]) * t +
              (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 +
              (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3),
        ),
      );
    }
  }
  out.push(pts.at(-1));
  return out;
}
// Largura da linha de luz: nasce fina na axila, cresce e afunila só um pouco até ser cortada pelo anel.
const largura = (wMax, u) =>
  (wMax / 2) *
  (u < 0.35 ? Math.pow(Math.sin((Math.PI / 2) * (u / 0.35)), 0.8) : 1 - 0.3 * ((u - 0.35) / 0.65));
// Traço afilado: polígono entre as duas bordas deslocadas pela normal.
function afilado(center, wMax, sgn) {
  const s = sample(center);
  const n = s.length;
  const left = [],
    right = [];
  for (let i = 0; i < n; i++) {
    const a = s[Math.max(0, i - 1)],
      b = s[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0],
      ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const u = i / (n - 1);
    const w = largura(wMax, u);
    left.push([s[i][0] - ty * w, s[i][1] + tx * w]);
    right.push([s[i][0] + ty * w, s[i][1] - tx * w]);
  }
  const poly = [...left, ...right.reverse()].map(([x, y]) => P([x * sgn, y]));
  return `M ${poly.map(xy).join(' L ')} Z`;
}
// Borda interna da linha de luz (limite do preenchimento do tronco).
function bordaInterna(center, wMax) {
  const s = sample(center);
  const n = s.length;
  return s.map((p, i) => {
    const a = s[Math.max(0, i - 1)],
      b = s[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0],
      ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const u = i / (n - 1);
    const w = largura(wMax, u);
    // normal apontando para o centro do corpo (x menor)
    const nx = -ty,
      ny = tx;
    const sg = nx < 0 ? 1 : -1;
    return [p[0] + sg * nx * w, p[1] + sg * ny * w];
  });
}

// ---------- Corpos (lado direito; o esquerdo é espelhado) ----------
// Cabeça oval (sem orelhas) e pescoço com transição suave até o trapézio.
const cabeca = [];
for (let k = 0; k <= 7; k++) {
  const a = ((125 * Math.PI) / 180) * (k / 7);
  cabeca.push([0.13 * Math.sin(a), -0.685 - 0.155 * Math.cos(a)]);
}
const A = {
  // Proporções da referência nos ombros e braços; tronco afunila suavemente até ser cortado pelo anel.
  contorno: [
    ...cabeca,
    [0.1, -0.53],
    [0.112, -0.47],
    [0.15, -0.415],
    [0.225, -0.36],
    [0.31, -0.318],
    [0.38, -0.297],
    [0.445, -0.25],
    [0.48, -0.16],
    [0.49, -0.05],
    [0.505, 0.06],
    [0.52, 0.19],
    [0.5, 0.33],
    [0.475, 0.43],
    [0.462, 0.4],
    [0.47, 0.24],
    [0.44, 0.09],
    [0.405, -0.03],
    [0.385, -0.09],
  ],
  linha: [
    [0.35, -0.11],
    [0.305, 0.03],
    [0.264, 0.18],
    [0.24, 0.33],
    [0.226, 0.48],
    [0.216, 0.63],
    [0.202, 0.78],
    [0.178, 0.92],
    [0.148, 1.06],
  ],
  wLinha: 0.065,
};
// ---------- "C" em duas camadas ----------
const yTop = -0.51,
  yBot = 0.49,
  ri = 0.79;
const oxT = Math.sqrt(1 - yTop ** 2),
  oxB = Math.sqrt(1 - yBot ** 2);
const ixT = Math.sqrt(ri ** 2 - yTop ** 2),
  ixB = Math.sqrt(ri ** 2 - yBot ** 2);
const anel = `M ${xy(P([oxT, yTop]))} A ${RO} ${RO} 0 1 0 ${xy(P([oxB, yBot]))} L ${xy(P([ixB, yBot]))} A ${ri * RO} ${ri * RO} 0 1 1 ${xy(P([ixT, yTop]))} Z`;
// Faixa clara sobreposta: nasce fina no topo, atrás da cabeça, e cobre o anel até a ponta superior.
const a0 = (-92 * Math.PI) / 180;
const s0 = P([Math.cos(a0), Math.sin(a0)]);
// Borda inferior da faixa: segue a borda interna do anel e, perto do topo, sobe até a borda externa.
const aI = (-74 * Math.PI) / 180;
const pI = [ri * Math.cos(aI), ri * Math.sin(aI)];
const cauda = `A ${ri * RO} ${ri * RO} 0 0 0 ${xy(P(pI))} C ${xy(P([pI[0] - 0.1, pI[1] - 0.04]))} ${xy(P([Math.cos(a0) + 0.06, Math.sin(a0) + 0.06]))} ${xy(s0)}`;
const faixa = `M ${xy(s0)} A ${RO} ${RO} 0 0 1 ${xy(P([oxT, yTop]))} L ${xy(P([ixT, yTop]))} ${cauda} Z`;

function simbolo(body, id) {
  const cont = (sgn) => mir(body.contorno, sgn).map(P);
  const inner = bordaInterna(body.linha, body.wLinha);
  // Preenchimento da metade: contorno + borda interna da linha lateral + eixo.
  const meia = (sgn) => {
    const c = cont(sgn);
    const li = mir(inner, sgn).map(P);
    return `M ${xy(c[0])}${catmull(c)} L ${li.map(xy).join(' L ')} L ${xy([C0, li.at(-1)[1]])} Z`;
  };
  const rim = (sgn) => {
    const c = cont(sgn);
    return `M ${xy(c[0])}${catmull(c)}`;
  };
  const linha = (sgn) => afilado(body.linha, body.wLinha, sgn);
  const topo = P([0, body.contorno[0][1]]);
  const queixo = P([0, -0.5]);
  const base = P([0, 1.0]);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="t">
  <title id="t">Corpivum</title>
  <defs>
    <linearGradient id="${id}-anel" gradientUnits="userSpaceOnUse" x1="60" y1="40" x2="330" y2="500">
      <stop offset="0" stop-color="#57d8ff"/><stop offset="0.45" stop-color="#1f86e6"/><stop offset="0.8" stop-color="#3cc4ff"/><stop offset="1" stop-color="#1f7fe0"/>
    </linearGradient>
    <radialGradient id="${id}-anel-sombra" gradientUnits="userSpaceOnUse" cx="256" cy="256" r="${RO}">
      <stop offset="${ri}" stop-color="#05224f" stop-opacity="0.85"/><stop offset="0.9" stop-color="#05224f" stop-opacity="0.25"/><stop offset="0.985" stop-color="#05224f" stop-opacity="0"/>
      <stop offset="0.99" stop-color="#bff2ff" stop-opacity="0.9"/><stop offset="1" stop-color="#bff2ff" stop-opacity="0.9"/>
    </radialGradient>
    <linearGradient id="${id}-faixa" gradientUnits="userSpaceOnUse" x1="250" y1="16" x2="470" y2="140">
      <stop offset="0" stop-color="#6fdcff" stop-opacity="0"/><stop offset="0.22" stop-color="#86e6ff" stop-opacity="0.95"/><stop offset="1" stop-color="#c2f5ff"/>
    </linearGradient>
    <linearGradient id="${id}-corpo" gradientUnits="userSpaceOnUse" x1="0" y1="50" x2="0" y2="500">
      <stop offset="0" stop-color="#a6ecff"/><stop offset="0.35" stop-color="#49b3f0"/><stop offset="0.7" stop-color="#1561b0"/><stop offset="1" stop-color="#0a3a75"/>
    </linearGradient>
    <linearGradient id="${id}-costura" gradientUnits="userSpaceOnUse" x1="256" y1="0" x2="380" y2="0">
      <stop offset="0" stop-color="#02101f" stop-opacity="0.45"/><stop offset="1" stop-color="#02101f" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="${id}-brilho" gradientUnits="userSpaceOnUse" cx="${f(P([0.36, -0.24])[0])}" cy="${f(P([0.36, -0.24])[1])}" r="85">
      <stop offset="0" stop-color="#d9f6ff" stop-opacity="0.6"/><stop offset="1" stop-color="#d9f6ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-brilho-cabeca" gradientUnits="userSpaceOnUse" cx="${f(P([0.07, -0.74])[0])}" cy="${f(P([0.07, -0.74])[1])}" r="40">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${id}-luz" gradientUnits="userSpaceOnUse" x1="0" y1="220" x2="0" y2="500">
      <stop offset="0" stop-color="#2a8cff"/><stop offset="0.45" stop-color="#3ab8ff"/><stop offset="1" stop-color="#1f62ff"/>
    </linearGradient>
    <filter id="${id}-sombra-faixa" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="${id}-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="${id}-externo"><circle cx="256" cy="256" r="${RO}"/></clipPath>
    <clipPath id="${id}-dir"><path d="${meia(1)}"/></clipPath>
  </defs>
  <!-- "C" em duas camadas: anel com sombra interna e luz na borda, faixa clara sobreposta no topo -->
  <path d="${anel}" fill="url(#${id}-anel)"/>
  <path d="${anel}" fill="url(#${id}-anel-sombra)"/>
  <path d="${faixa}" fill="#01122b" opacity="0.35" filter="url(#${id}-sombra-faixa)" transform="translate(-3 4)"/>
  <path d="${faixa}" fill="url(#${id}-faixa)"/>
  <path d="${faixa}" fill="url(#${id}-anel-sombra)" opacity="0.5"/>
  <!-- Figura -->
  <g clip-path="url(#${id}-externo)">
    <!-- recorte escuro separando a figura do anel -->
    <g fill="#000" stroke="#000" stroke-width="8" stroke-linejoin="round">
      <path d="${meia(1)}"/><path d="${meia(-1)}"/><path d="${linha(1)}"/><path d="${linha(-1)}"/>
    </g>
    <!-- metade em sombra: interior escuro, só a luz de contorno -->
    <path d="${meia(-1)}" fill="#010812"/>
    <path d="${rim(-1)}" fill="none" stroke="#4cc6ff" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" filter="url(#${id}-glow)" opacity="0.9"/>
    <path d="${rim(-1)}" fill="none" stroke="#d4f6ff" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <!-- metade iluminada: degradê, sombra junto à costura e brilhos -->
    <path d="${meia(1)}" fill="url(#${id}-corpo)"/>
    <g clip-path="url(#${id}-dir)">
      <rect x="256" y="0" width="256" height="512" fill="url(#${id}-costura)"/>
      <rect x="0" y="0" width="512" height="512" fill="url(#${id}-brilho)"/>
      <rect x="0" y="0" width="512" height="512" fill="url(#${id}-brilho-cabeca)"/>
    </g>
    <path d="${rim(1)}" fill="none" stroke="#8fe4ff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" filter="url(#${id}-glow)"/>
    <!-- linhas de luz descendo pelas laterais -->
    <path d="${linha(-1)}" fill="url(#${id}-luz)" filter="url(#${id}-glow)"/>
    <path d="${linha(1)}" fill="url(#${id}-luz)" filter="url(#${id}-glow)"/>
    <!-- divisão claro/escuro: forte na cabeça, sutil no tronco -->
    <line x1="256" y1="${f(topo[1])}" x2="256" y2="${f(queixo[1])}" stroke="#effbff" stroke-width="2.5"/>
    <line x1="256" y1="${f(queixo[1])}" x2="256" y2="${f(base[1])}" stroke="#bfefff" stroke-width="1.5" opacity="0.7"/>
  </g>
</svg>
`;
}

writeFileSync(path.join(brandDir, 'corpivum-simbolo-a.svg'), simbolo(A, 'a'));
console.log('ok');
