// ARQUIVO (ADR-0045): estudo descartado; o logo oficial é a imagem original. Rodar a partir da raiz do repositório.
// Uso: node scripts/brand/arquivo/grade-referencia.mjs <png-512-recortado> <saida.png>
// Sobrepõe uma grade normalizada (centro do "C" = 0, raio = 1) para medir a referência.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [src, out] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
const uri = 'data:image/png;base64,' + readFileSync(src).toString('base64');
// grade em coordenadas normalizadas: centro 256, raio 240 → passos de 0.1 (24 px), ampliado 2×
let lines = '';
for (let i = -10; i <= 10; i++) {
  const v = (256 + i * 24) * 2;
  const c = i === 0 ? '#ff4' : i % 5 === 0 ? '#f80' : '#f0f6';
  lines += `<line x1="${v}" y1="0" x2="${v}" y2="1024" stroke="${c}" stroke-width="1"/><line x1="0" y1="${v}" x2="1024" y2="${v}" stroke="${c}" stroke-width="1"/>`;
  if (i % 2 === 0)
    lines += `<text x="${v + 2}" y="12" fill="#ff4" font-size="11">${(i / 10).toFixed(1)}</text><text x="2" y="${v - 2}" fill="#ff4" font-size="11">${(i / 10).toFixed(1)}</text>`;
}
await p.setContent(
  `<body style="margin:0"><div style="position:relative"><img src="${uri}" style="width:1024px;display:block;image-rendering:pixelated"><svg style="position:absolute;inset:0" width="1024" height="1024">${lines}</svg></div>`,
);
await p.waitForFunction(() => document.images[0].complete);
await p.screenshot({ path: out });
await b.close();
