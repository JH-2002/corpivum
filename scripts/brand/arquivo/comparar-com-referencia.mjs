// ARQUIVO (ADR-0045): estudo descartado; o logo oficial é a imagem original. Rodar a partir da raiz do repositório.
// Uso: node scripts/brand/arquivo/comparar-com-referencia.mjs  (depois de gerar-variantes.mjs)
// Compara a referência recortada no "C" com a variante A em 512 e 64 px.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const repo = process.cwd();
const out = path.join(repo, 'capturas', 'logo', 'arquivo');
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ deviceScaleFactor: 1 });
const BG = '#000';
// Referência: recorte quadrado em volta do "C" (centro ≈ 628.7, 515.3; raio ≈ 240 px no original).
const ref =
  'data:image/png;base64,' +
  readFileSync(path.join(repo, 'docs/brand/logo-referencia.png')).toString('base64');
const svg = (n) =>
  'data:image/svg+xml;base64,' + Buffer.from(readFileSync(path.join(out, n))).toString('base64');
async function shot(html, w, file) {
  await p.setViewportSize({ width: w, height: w });
  await p.setContent(`<body style="margin:0;background:${BG};overflow:hidden">${html}</body>`);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete));
  await p.screenshot({ path: path.join(out, file) });
}
for (const w of [512, 64]) {
  const k = w / 512;
  await shot(
    `<div style="width:${w}px;height:${w}px;overflow:hidden;position:relative"><img src="${ref}" style="position:absolute;left:${-372.7 * k}px;top:${-259.3 * k}px;width:${1254 * k}px"></div>`,
    w,
    `referencia_${w}.png`,
  );
  await shot(
    `<img src="${svg('corpivum-simbolo-a.svg')}" width="${w}" height="${w}" style="display:block">`,
    w,
    `variante-a_${w}.png`,
  );
}
const img = (n) => 'data:image/png;base64,' + readFileSync(path.join(out, n)).toString('base64');
const col = (
  name,
  label,
) => `<figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:10px">
  <img src="${img(`${name}_512.png`)}">
  <div style="display:flex;gap:24px;align-items:flex-end"><img src="${img(`${name}_64.png`)}"><img src="${img(`${name}_64.png`)}" style="zoom:4;image-rendering:pixelated"></div>
  <figcaption style="font:15px system-ui;color:#9fb3c8">${label} — 512 · 64 · 64 ampliado 4×</figcaption></figure>`;
await p.setViewportSize({ width: 1180, height: 900 });
await p.setContent(`<body style="margin:0;padding:24px;background:${BG};display:flex;gap:32px">
  ${col('referencia', 'Referência')}${col('variante-a', 'A refinada')}</body>`);
await p.waitForFunction(() => [...document.images].every((i) => i.complete));
await p.screenshot({ path: path.join(out, 'comparacao-a-refinada.png'), fullPage: true });
await b.close();
console.log('ok');
