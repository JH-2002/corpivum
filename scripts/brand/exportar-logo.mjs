// Exporta o logo oficial (docs/brand/logo-referencia.png) sem o fundo preto, em WebP e PNG com transparência,
// e os ícones pequenos a partir do favicon aprovado (docs/brand/corpivum-favicon.svg), copiados também para
// src/app/icon.svg e src/app/apple-icon.png. ADR-0045.
//
// Uso: node scripts/brand/exportar-logo.mjs [--saida public/brand] [--folha capturas/logo]
//
// Fundo → alfa: a imagem é brilho sobre preto. Para cada pixel, alfa = maior canal (depois de descontar o nível de
// preto do fundo) e cor = canal / alfa. Isso inverte a composição sobre preto: o brilho e as bordas suaves ficam, o
// preto vira transparente e não sobra halo escuro sobre o fundo do app.
// Camada de apoio: o interior do "C" (metade escura do corpo e vãos) também ficaria transparente e deixaria aparecer
// gradientes e brilhos por trás. Por isso, atrás da imagem vai um disco sólido na cor mais escura da imagem,
// preenchendo o círculo do símbolo, com borda suave; o brilho de fora do círculo continua transparente.
// Usa o Chromium do Playwright (já no projeto) para decodificar, reduzir e codificar; nenhuma dependência nova.
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] : padrao;
};
const SAIDA = arg('--saida', 'public/brand');
const FOLHA = arg('--folha', 'capturas/logo');
const ORIGEM = 'docs/brand/logo-referencia.png';
const FAVICON = 'docs/brand/corpivum-favicon.svg';
const FUNDO_APP = '#0b1118';
const PRETO = 2; // nível máximo medido no fundo da referência (0–1)
// Círculo do "C" na imagem original, medido com a grade (scripts/brand/arquivo/grade-referencia.mjs).
const CIRCULO = { cx: 628.7, cy: 515.3, r: 240 };
const APOIO = { solido: 0.95, fim: 0.985 }; // frações do raio: sólido até 0.95, borda suave até 0.985
const TAMANHOS = [512, 256, 128, 64];
const ICONES = [16, 32, 48, 180, 192, 512]; // favicon, apple-touch-icon e manifest (C + ponto)

// A pasta de saída é apagada antes de gerar: só aceita uma subpasta de public/.
if (!path.resolve(SAIDA).startsWith(path.resolve('public') + path.sep))
  throw new Error(`--saida precisa ficar dentro de public/: ${SAIDA}`);
rmSync(SAIDA, { recursive: true, force: true });
mkdirSync(SAIDA, { recursive: true });
mkdirSync(FOLHA, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
const dataUri = (arquivo, tipo) =>
  `data:${tipo};base64,${readFileSync(arquivo).toString('base64')}`;

const gerados = await page.evaluate(
  async ({ origem, preto, tamanhos, circulo, apoio }) => {
    const img = new Image();
    img.src = origem;
    await img.decode();
    const W = img.width,
      H = img.height;
    const base = new OffscreenCanvas(W, H);
    const bx = base.getContext('2d');
    bx.drawImage(img, 0, 0);
    const dados = bx.getImageData(0, 0, W, H);
    const d = dados.data;
    const escala = 255 / (255 - preto);
    for (let i = 0; i < d.length; i += 4) {
      const r = Math.max(0, d[i] - preto) * escala;
      const g = Math.max(0, d[i + 1] - preto) * escala;
      const b = Math.max(0, d[i + 2] - preto) * escala;
      const a = Math.max(r, g, b);
      if (a < 1) {
        d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
        continue;
      }
      d[i] = Math.round((r * 255) / a);
      d[i + 1] = Math.round((g * 255) / a);
      d[i + 2] = Math.round((b * 255) / a);
      d[i + 3] = Math.round(a);
    }
    bx.putImageData(dados, 0, 0);

    // Cor mais escura da imagem dentro do círculo (na imagem original).
    const orig = new OffscreenCanvas(W, H).getContext('2d');
    orig.drawImage(img, 0, 0);
    const od = orig.getImageData(0, 0, W, H).data;
    let escura = [255, 255, 255],
      lumMin = Infinity;
    for (let y = Math.floor(circulo.cy - circulo.r); y < circulo.cy + circulo.r; y++)
      for (let x = Math.floor(circulo.cx - circulo.r); x < circulo.cx + circulo.r; x++) {
        if (Math.hypot(x - circulo.cx, y - circulo.cy) > circulo.r * apoio.solido) continue;
        const i = (y * W + x) * 4;
        const l = 0.2126 * od[i] + 0.7152 * od[i + 1] + 0.0722 * od[i + 2];
        if (l < lumMin) {
          lumMin = l;
          escura = [od[i], od[i + 1], od[i + 2]];
        }
      }
    const corApoio = `rgb(${escura.join(',')})`;
    const comApoio = new OffscreenCanvas(W, H);
    const cx2 = comApoio.getContext('2d');
    const grad = cx2.createRadialGradient(
      circulo.cx,
      circulo.cy,
      0,
      circulo.cx,
      circulo.cy,
      circulo.r * apoio.fim,
    );
    grad.addColorStop(0, corApoio);
    grad.addColorStop(apoio.solido / apoio.fim, corApoio);
    grad.addColorStop(1, `rgba(${escura.join(',')},0)`);
    cx2.fillStyle = grad;
    cx2.beginPath();
    cx2.arc(circulo.cx, circulo.cy, circulo.r * apoio.fim, 0, Math.PI * 2);
    cx2.fill();
    cx2.drawImage(base, 0, 0);

    // Caixas: logo completo = tudo que tem alfa; símbolo = só a parte acima do texto, em quadrado.
    const caixa = (yMax) => {
      let x0 = W,
        y0 = H,
        x1 = 0,
        y1 = 0;
      for (let y = 0; y < yMax; y++)
        for (let x = 0; x < W; x++)
          if (d[(y * W + x) * 4 + 3] > 8) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      return { x0, y0, x1, y1 };
    };
    // Linha vazia entre o símbolo e o texto: a primeira linha sem alfa abaixo do centro da imagem.
    let corte = Math.floor(H / 2);
    for (; corte < H; corte++) {
      let vazia = true;
      for (let x = 0; x < W && vazia; x++) if (d[(corte * W + x) * 4 + 3] > 8) vazia = false;
      if (vazia) break;
    }
    const margem = (c, m) => ({ x0: c.x0 - m, y0: c.y0 - m, x1: c.x1 + m, y1: c.y1 + m });
    const s = margem(caixa(corte), 12);
    const lado = Math.max(s.x1 - s.x0, s.y1 - s.y0);
    const cx = (s.x0 + s.x1) / 2,
      cy = (s.y0 + s.y1) / 2;
    const simbolo = {
      x: Math.round(cx - lado / 2),
      y: Math.round(cy - lado / 2),
      w: lado,
      h: lado,
    };
    const l = margem(caixa(H), 16);
    const logo = { x: l.x0, y: l.y0, w: l.x1 - l.x0, h: l.y1 - l.y0 };

    // Redução em etapas de no máximo 2× (melhor que um único drawImage grande).
    const reduzir = (rc, largura, origemReducao = comApoio) => {
      let fonte = origemReducao,
        sx = rc.x,
        sy = rc.y,
        sw = rc.w,
        sh = rc.h;
      const alvoH = Math.round((largura * rc.h) / rc.w);
      while (sw / 2 > largura) {
        const c = new OffscreenCanvas(Math.round(sw / 2), Math.round(sh / 2));
        const x = c.getContext('2d');
        x.imageSmoothingQuality = 'high';
        x.drawImage(fonte, sx, sy, sw, sh, 0, 0, c.width, c.height);
        fonte = c;
        sx = 0;
        sy = 0;
        sw = c.width;
        sh = c.height;
      }
      const c = new OffscreenCanvas(largura, alvoH);
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(fonte, sx, sy, sw, sh, 0, 0, largura, alvoH);
      return c;
    };
    const b64 = async (blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    };
    const out = [];
    for (const [nome, rc] of [
      ['corpivum-simbolo', simbolo],
      ['corpivum-logo', logo],
    ]) {
      for (const t of tamanhos) {
        const c = reduzir(rc, t);
        out.push({
          arquivo: `${nome}-${t}.png`,
          b64: await b64(await c.convertToBlob({ type: 'image/png' })),
        });
        out.push({
          arquivo: `${nome}-${t}.webp`,
          b64: await b64(await c.convertToBlob({ type: 'image/webp', quality: 0.9 })),
        });
      }
    }
    // Para a folha de teste: o símbolo sem a camada de apoio (antes).
    const semApoio = [];
    for (const t of [128, 64])
      semApoio.push({
        arquivo: `sem-apoio-simbolo-${t}.png`,
        b64: await b64(await reduzir(simbolo, t, base).convertToBlob({ type: 'image/png' })),
      });
    return { out, semApoio, simbolo, logo, corte, corApoio };
  },
  {
    origem: dataUri(ORIGEM, 'image/png'),
    preto: PRETO,
    tamanhos: TAMANHOS,
    circulo: CIRCULO,
    apoio: APOIO,
  },
);
for (const { arquivo, b64 } of gerados.out)
  writeFileSync(path.join(SAIDA, arquivo), Buffer.from(b64, 'base64'));
for (const { arquivo, b64 } of gerados.semApoio)
  writeFileSync(path.join(FOLHA, arquivo), Buffer.from(b64, 'base64'));

// Ícones pequenos e do app: favicon aprovado (C + ponto), renderizado do SVG.
const favicon = dataUri(FAVICON, 'image/svg+xml');
for (const t of ICONES) {
  await page.setViewportSize({ width: t, height: t });
  await page.setContent(
    `<body style="margin:0;background:transparent"><img src="${favicon}" width="${t}" height="${t}" style="display:block">`,
  );
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({
    path: path.join(SAIDA, `corpivum-icone-${t}.png`),
    omitBackground: true,
  });
}

// Ícones do app pelas convenções do Next (src/app/icon.svg e apple-icon.png), sempre iguais ao favicon aprovado.
copyFileSync(FAVICON, 'src/app/icon.svg');
copyFileSync(path.join(SAIDA, 'corpivum-icone-180.png'), 'src/app/apple-icon.png');

// Folha de revisão sobre o fundo do app.
const kib = (f) => (statSync(path.join(SAIDA, f)).size / 1024).toFixed(1);
const src = (f) => dataUri(path.join(SAIDA, f), f.endsWith('.webp') ? 'image/webp' : 'image/png');
const rotulo = (txt) =>
  `<figcaption style="font:13px system-ui;color:#9fb3c8;text-align:center">${txt}</figcaption>`;
const fig = (f, larg, txt, zoom = 1) =>
  `<figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:8px">
     <img src="${src(f)}" style="width:${larg}px;zoom:${zoom};image-rendering:${zoom > 1 ? 'pixelated' : 'auto'}">${rotulo(txt)}</figure>`;
const linha = (titulo, itens) =>
  `<section style="margin-bottom:36px"><h2 style="font:600 15px system-ui;color:#dbe6f2;margin:0 0 14px">${titulo}</h2>
   <div style="display:flex;align-items:flex-end;gap:36px;flex-wrap:wrap">${itens.join('')}</div></section>`;
const html = `<body style="margin:0;padding:28px;background:${FUNDO_APP}">
  ${linha('Símbolo (WebP) sobre o fundo do app #0b1118', [
    fig('corpivum-simbolo-512.webp', 512, `512 px · ${kib('corpivum-simbolo-512.webp')} KiB`),
    fig('corpivum-simbolo-128.webp', 128, `128 px · ${kib('corpivum-simbolo-128.webp')} KiB`),
    fig('corpivum-simbolo-64.webp', 64, `64 px · ${kib('corpivum-simbolo-64.webp')} KiB`),
    fig('corpivum-simbolo-64.webp', 64, '64 px ampliado 4×', 4),
  ])}
  ${linha('Logo completo (WebP)', [
    fig('corpivum-logo-512.webp', 512, `512 px · ${kib('corpivum-logo-512.webp')} KiB`),
    fig('corpivum-logo-128.webp', 128, `128 px · ${kib('corpivum-logo-128.webp')} KiB`),
    fig('corpivum-logo-64.webp', 64, `64 px · ${kib('corpivum-logo-64.webp')} KiB`),
  ])}
  ${linha('Abaixo de 48 px: favicon aprovado (C + ponto)', [
    fig('corpivum-icone-48.png', 48, '48 px'),
    fig('corpivum-icone-32.png', 32, '32 px'),
    fig('corpivum-icone-16.png', 16, '16 px'),
    fig('corpivum-icone-16.png', 16, '16 px ampliado 6×', 6),
  ])}</body>`;
await page.setViewportSize({ width: 1500, height: 1000 });
await page.setContent(html);
await page.waitForFunction(() => [...document.images].every((i) => i.complete));
await page.screenshot({ path: path.join(FOLHA, 'folha-logo-oficial.png'), fullPage: true });

// Teste sobre fundos não lisos: liso, gradiente azul e cartão com brilho; antes (sem apoio) e depois.
const srcFolha = (f) => dataUri(path.join(FOLHA, f), 'image/png');
const FUNDOS = {
  'Fundo liso #0b1118': FUNDO_APP,
  'Gradiente azul': 'linear-gradient(135deg,#0b1118 0%,#123a6b 45%,#2f9bff 100%)',
  'Cartão com brilho':
    'radial-gradient(circle at 55% 45%,rgba(160,220,255,.55) 0,rgba(47,155,255,.25) 22%,rgba(19,28,38,0) 48%),#131c26',
};
const celula = (fundo, img, larg, txt) =>
  `<figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:6px">
     <div style="width:180px;height:160px;display:grid;place-items:center;border-radius:14px;border:1px solid #23303d;background:${fundo}">
       <img src="${img}" style="width:${larg}px"></div>${rotulo(txt)}</figure>`;
const testes = Object.entries(FUNDOS)
  .map(
    ([nome, fundo]) =>
      `<section style="margin-bottom:24px"><h2 style="font:600 15px system-ui;color:#dbe6f2;margin:0 0 10px">${nome}</h2>
       <div style="display:flex;gap:20px;flex-wrap:wrap">
         ${celula(fundo, srcFolha('sem-apoio-simbolo-128.png'), 128, 'antes · 128')}
         ${celula(fundo, src('corpivum-simbolo-128.webp'), 128, 'depois · 128')}
         ${celula(fundo, srcFolha('sem-apoio-simbolo-64.png'), 64, 'antes · 64')}
         ${celula(fundo, src('corpivum-simbolo-64.webp'), 64, 'depois · 64')}
         ${celula(fundo, src('corpivum-logo-128.webp'), 128, 'logo completo · 128')}
       </div></section>`,
  )
  .join('');
await page.setViewportSize({ width: 1060, height: 900 });
await page.setContent(
  `<body style="margin:0;padding:24px;background:${FUNDO_APP}">${testes}</body>`,
);
await page.waitForFunction(() => [...document.images].every((i) => i.complete));
await page.screenshot({ path: path.join(FOLHA, 'teste-fundos.png'), fullPage: true });

// Detalhe da borda: recorte ampliado do símbolo 512 para conferir halo escuro.
await page.setViewportSize({ width: 800, height: 800 });
await page.setContent(
  `<body style="margin:0;background:${FUNDO_APP}"><img src="${src('corpivum-simbolo-512.png')}" style="display:block;width:2048px;margin:-560px 0 0 -120px;image-rendering:pixelated">`,
);
await page.waitForFunction(() => document.images[0].complete);
await page.screenshot({ path: path.join(FOLHA, 'detalhe-borda-4x.png') });
await browser.close();

console.log('recortes (px na imagem original):', {
  simbolo: gerados.simbolo,
  logo: gerados.logo,
  linhaDeCorte: gerados.corte,
  corDaCamadaDeApoio: gerados.corApoio,
});
const linhas = gerados.out
  .map(({ arquivo }) => arquivo)
  .concat(ICONES.map((t) => `corpivum-icone-${t}.png`));
for (const f of linhas) console.log(f.padEnd(28), `${kib(f).padStart(6)} KiB`);
