// Mídia do README (ADR-0056): `pnpm readme:midia`. Gera em `docs/readme/` (versionada):
// - `twin.gif`: ~8 s do início com o twin e do twin completo (até 5 MB);
// - capturas em WebP da primeira dobra de algumas telas, em desktop (1440 px) e celular (390 px);
// - `social-preview.png`: prévia social 1280×640, para subir à mão em Settings → Social preview.
// Usa o servidor da demo no modo só demo (`scripts/demo-server.mjs`; pule o build com --sem-build se o build já é
// desse modo). Dados 100% fictícios. O FFmpeg vem do `ffmpeg-static` (só desenvolvimento), baixado na primeira vez.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { DEMO_BODY_MODEL_STORAGE_KEY } from '../src/modules/twin/bodyModel.ts';
import { BROWSER_ARGS, ROOT, createDemoServer, settle, tourSeenState } from './demo-server.mjs';

/** Destino final; só é trocado no fim, com tudo gerado (falha no meio deixa a pasta como estava). */
const DEST = path.join(ROOT, 'docs', 'readme');
/** Intermediários (PNG, vídeo) e a saída em preparo: dentro de `capturas/`, fora do Git, apagados no fim. */
const TMP = path.join(ROOT, 'capturas', '.readme-midia');
const OUT = path.join(TMP, 'saida');
const skipBuild = process.argv.includes('--sem-build');
const { base: BASE, run } = createDemoServer({
  label: 'readme:midia',
  port: Number(process.env.README_MIDIA_PORT ?? 3301),
  portVar: 'README_MIDIA_PORT',
});

const GIF_SECONDS = 8;
const GIF_MAX_BYTES = 5 * 1024 * 1024;
/** Tentativas do GIF, da mais nítida à mais leve, até caber em GIF_MAX_BYTES. */
const GIF_ATTEMPTS = [
  { fps: 12, width: 960 },
  { fps: 10, width: 800 },
  { fps: 8, width: 720 },
];
const WEBP_QUALITY = 80;

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const MOBILE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};
/** Título do 3D na página do twin: as capturas e o GIF rolam até ele, para o modelo aparecer inteiro. */
const TWIN_3D_HEADING = 'Seu corpo em 3D';
/**
 * Uma tela de cada captura: `name` do arquivo, rota, `model` do twin da demo (padrão: o da pessoa fictícia) e
 * `scrollTo`, título até o qual a janela rola (padrão: o topo).
 */
const DESKTOP_SHOTS = [
  { name: 'inicio_desktop', url: '/demo' },
  { name: 'twin_desktop', url: '/demo/twin', model: 'feminine', scrollTo: TWIN_3D_HEADING },
  { name: 'sono_desktop', url: '/demo/sono' },
  { name: 'timeline_desktop', url: '/demo/timeline' },
];
const MOBILE_SHOTS = [
  { name: 'inicio_celular', url: '/demo' },
  { name: 'twin_celular', url: '/demo/twin', scrollTo: TWIN_3D_HEADING },
  { name: 'alimentacao_celular', url: '/demo/alimentacao' },
];

const require = createRequire(import.meta.url);

/**
 * SHA-256 do binário do FFmpeg do release `b6.1.1` do ffmpeg-static 5.3.0, por plataforma, conforme o `digest` que o
 * GitHub publica para cada asset (`gh api repos/eugeneware/ffmpeg-static/releases/tags/b6.1.1`). O install do pacote
 * não confere integridade; aqui, binário diferente não roda. Atualizar junto com a versão do pacote (ADR-0056).
 */
const FFMPEG_SHA256 = {
  'win32-x64': '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00',
  'linux-x64': 'e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99',
  'linux-arm64': '6bb182d0d75d23028db82e9e4f723ca69b853d055698486e6984ddb2c06fb8ce',
  'darwin-x64': 'ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894',
  'darwin-arm64': 'a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584',
};
/** Variáveis com que o ffmpeg-static troca o binário ou a origem do download: ignoradas. */
const FFMPEG_OVERRIDE_VARS = ['FFMPEG_BIN', 'FFMPEG_BINARIES_URL', 'FFMPEG_BINARY_RELEASE'];

let verifiedBin;

/**
 * Caminho do FFmpeg conferido pelo SHA-256; baixa o binário na primeira vez (o install do pacote fica desligado
 * no pnpm-workspace).
 */
function ffmpegBin() {
  if (verifiedBin) return verifiedBin;
  const expected = FFMPEG_SHA256[`${process.platform}-${process.arch}`];
  if (!expected) throw new Error(`sem SHA-256 do FFmpeg para ${process.platform}-${process.arch}`);
  const pkgDir = path.dirname(require.resolve('ffmpeg-static/package.json'));
  const bin = path.join(pkgDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (!existsSync(bin)) {
    console.log('readme:midia: baixando o binário do FFmpeg (ffmpeg-static)...');
    const env = { ...process.env };
    for (const key of FFMPEG_OVERRIDE_VARS) delete env[key];
    const result = spawnSync(process.execPath, ['install.js'], {
      cwd: pkgDir,
      env,
      stdio: 'inherit',
    });
    if (result.status !== 0 || !existsSync(bin))
      throw new Error('não foi possível baixar o FFmpeg');
  }
  const actual = createHash('sha256').update(readFileSync(bin)).digest('hex');
  if (actual !== expected) {
    rmSync(bin, { force: true });
    throw new Error(`o binário do FFmpeg não confere (SHA-256 ${actual}); apagado sem executar`);
  }
  verifiedBin = bin;
  return bin;
}

function ffmpeg(args) {
  execFileSync(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: 'inherit',
  });
}

function toWebp(png, name) {
  const out = path.join(OUT, `${name}.webp`);
  ffmpeg(['-i', png, '-c:v', 'libwebp', '-quality', String(WEBP_QUALITY), out]);
  return out;
}

/**
 * Rola a janela até o elemento ficar logo abaixo das barras fixas do topo (aviso da demo, cabeçalho, período);
 * `steps` > 1 rola aos poucos (para o vídeo).
 */
async function scrollBelowHeader(page, locator, steps = 1) {
  const top = await locator.first().evaluate((el) => {
    // Barras fixas no topo: largura de mais da metade da janela; deixa de fora a navegação de baixo do celular.
    const bars = [...document.querySelectorAll('body *')]
      .filter((node) => ['sticky', 'fixed'].includes(getComputedStyle(node).position))
      .map((node) => node.getBoundingClientRect())
      .filter(
        (r) => r.top <= 1 && r.width > window.innerWidth / 2 && r.height < window.innerHeight / 2,
      );
    const covered = Math.max(0, ...bars.map((r) => r.bottom));
    return el.getBoundingClientRect().top + window.scrollY - covered - 12;
  });
  const from = await page.evaluate(() => window.scrollY);
  for (let i = 1; i <= steps; i += 1) {
    await page.evaluate((y) => window.scrollTo(0, y), from + ((top - from) * i) / steps);
    if (steps > 1) await page.waitForTimeout(25);
  }
}

function kib(file) {
  return `${Math.round(statSync(file).size / 1024)} KiB`;
}

/** Apresentação liberada no contexto (a rota `?tela=` exige começar pela entrada), como em `pnpm capturas`. */
async function startPresentation(page) {
  await page.goto(`${BASE}/demo/apresentacao`);
  await page.getByRole('button', { name: 'Começar apresentação' }).click();
  await page.getByRole('button', { name: 'Sair da apresentação' }).waitFor();
}

async function screenshots(browser) {
  for (const [size, shots] of [
    [DESKTOP, DESKTOP_SHOTS],
    [MOBILE, MOBILE_SHOTS],
  ]) {
    const context = await browser.newContext({
      ...size,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      storageState: tourSeenState(BASE),
    });
    const page = await context.newPage();
    for (const { name, url, model, scrollTo } of shots) {
      await page.goto(BASE + url);
      await page.evaluate(
        ([key, value]) => (value ? localStorage.setItem(key, value) : localStorage.removeItem(key)),
        [DEMO_BODY_MODEL_STORAGE_KEY, model ?? null],
      );
      if (model) await page.reload();
      await settle(page);
      if (scrollTo) {
        await scrollBelowHeader(page, page.getByRole('heading', { name: scrollTo, exact: true }));
        await page.waitForTimeout(500);
      }
      const png = path.join(TMP, `${name}.png`);
      await page.screenshot({ path: png });
      toWebp(png, name);
    }
    if (size === DESKTOP) {
      await startPresentation(page);
      await page.goto(`${BASE}/demo/apresentacao?tela=relatorio`);
      await settle(page);
      const png = path.join(TMP, 'relatorio_desktop.png');
      await page.screenshot({ path: png });
      toWebp(png, 'relatorio_desktop');
      // Recorte do twin para a prévia social.
      await page.goto(`${BASE}/demo/twin`);
      await settle(page);
      await page
        .locator('canvas')
        .first()
        .screenshot({ path: path.join(TMP, 'twin-recorte.png') });
    }
    await context.close();
  }
}

/** Grava o início com o twin e o twin completo; devolve o vídeo e o segundo em que a cena começa. */
async function recordTwin(browser) {
  const size = { width: 1280, height: 800 };
  const context = await browser.newContext({
    viewport: size,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    storageState: tourSeenState(BASE),
    recordVideo: { dir: TMP, size },
  });
  const page = await context.newPage();
  const recordingStart = Date.now();
  await page.goto(`${BASE}/demo`);
  await settle(page);
  // O twin do início inteiro na janela, sob o cabeçalho.
  await scrollBelowHeader(page, page.locator('[data-tour="twin-hero"]'));
  await page.waitForTimeout(300);
  const sceneStart = (Date.now() - recordingStart) / 1000;

  // Início: troca de região no twin em destaque e um giro arrastando o modelo.
  for (const name of ['Cintura', 'Quadril']) {
    await page.getByRole('button', { name, exact: true }).first().click();
    await page.waitForTimeout(900);
  }
  const box = await page.locator('canvas').first().boundingBox();
  if (box) {
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.35, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, y, { steps: 40 });
    await page.mouse.up();
    await page.waitForTimeout(700);
  }
  // Twin completo.
  await page.getByRole('link', { name: 'Abrir twin completo' }).click();
  await page.waitForURL('**/demo/twin');
  await page.locator('canvas').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await scrollBelowHeader(
    page,
    page.getByRole('heading', { name: TWIN_3D_HEADING, exact: true }),
    20,
  );
  await page.waitForTimeout(900);
  for (const name of ['Peito', 'Braço']) {
    await page.getByRole('button', { name, exact: true }).first().click();
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(800);

  const video = page.video();
  await context.close();
  if (!video) throw new Error('sem gravação');
  return { video: await video.path(), sceneStart };
}

function toGif({ video, sceneStart }) {
  const out = path.join(OUT, 'twin.gif');
  for (const { fps, width } of GIF_ATTEMPTS) {
    ffmpeg([
      '-ss',
      sceneStart.toFixed(2),
      '-t',
      String(GIF_SECONDS),
      '-i',
      video,
      '-filter_complex',
      `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];` +
        '[a]palettegen=max_colors=128:stats_mode=diff[p];' +
        '[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
      '-loop',
      '0',
      out,
    ]);
    if (statSync(out).size <= GIF_MAX_BYTES) return out;
    console.log(`readme:midia: GIF com ${kib(out)} a ${fps} fps e ${width} px; tentando mais leve`);
  }
  throw new Error(`o GIF não coube em ${GIF_MAX_BYTES / 1024 / 1024} MB`);
}

function dataUrl(file, type) {
  return `data:${type};base64,${readFileSync(file).toString('base64')}`;
}

/** Prévia social 1280×640 nas cores do tema escuro (tokens.css) e com a Inter auto-hospedada. */
async function socialPreview(browser) {
  const font = dataUrl(
    path.join(ROOT, 'src', 'app', 'fonts', 'inter-latin-400-700.woff2'),
    'font/woff2',
  );
  const symbol = dataUrl(
    path.join(ROOT, 'public', 'brand', 'corpivum-simbolo-256.png'),
    'image/png',
  );
  const twin = dataUrl(path.join(TMP, 'twin-recorte.png'), 'image/png');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    @font-face { font-family: Inter; src: url(${font}) format('woff2'); font-weight: 400 700; }
    * { box-sizing: border-box; margin: 0; }
    body { width: 1280px; height: 640px; overflow: hidden; font-family: Inter, sans-serif; color: #e8eef4;
      background: radial-gradient(circle at 78% 50%, #102a4a 0%, #0b1118 62%); }
    .text { position: absolute; left: 88px; top: 0; bottom: 0; width: 640px; display: flex;
      flex-direction: column; justify-content: center; gap: 28px; }
    .brand { display: flex; align-items: center; gap: 24px; }
    .brand img { width: 104px; height: 104px; }
    h1 { font-size: 84px; font-weight: 700; letter-spacing: -0.02em; }
    p { font-size: 32px; line-height: 1.35; color: #cfe6ff; }
    .tags { font-size: 22px; line-height: 1.5; color: #a9b7c4; }
    .badge { align-self: flex-start; font-size: 20px; font-weight: 600; color: #cfe6ff; padding: 8px 16px;
      border: 2px solid #4aa8ff; border-radius: 999px; }
    .twin { position: absolute; right: 40px; top: 20px; height: 600px; width: 520px; object-fit: cover;
      object-position: center; -webkit-mask-image: radial-gradient(ellipse at center, #000 55%, transparent 75%); }
  </style></head><body>
    <img class="twin" src="${twin}" alt="">
    <div class="text">
      <div class="brand"><img src="${symbol}" alt=""><h1>Corpivum</h1></div>
      <p>Acompanhamento pessoal do corpo e da rotina, com twin 3D feito só com as suas medidas.</p>
      <div class="tags">Next.js · TypeScript · PostgreSQL + RLS · Three.js<br>Sem IA · sem anúncios · sem rastreadores</div>
      <div class="badge">Pré-lançamento · demo com dados fictícios</div>
    </div>
  </body></html>`;
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(OUT, 'social-preview.png');
  await page.screenshot({ path: out });
  await page.close();
  return out;
}

async function generate() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  try {
    ffmpegBin();
    const browser = await chromium.launch({ args: BROWSER_ARGS });
    try {
      await screenshots(browser);
      toGif(await recordTwin(browser));
      await socialPreview(browser);
    } finally {
      await browser.close();
    }
    // Tudo gerado: só agora troca o conteúdo da pasta (só desta mídia).
    mkdirSync(DEST, { recursive: true });
    for (const entry of readdirSync(DEST)) rmSync(path.join(DEST, entry), { force: true });
    for (const entry of readdirSync(OUT)) {
      copyFileSync(path.join(OUT, entry), path.join(DEST, entry));
      console.log(`readme:midia: docs/readme/${entry} (${kib(path.join(DEST, entry))})`);
    }
  } finally {
    rmSync(TMP, { recursive: true, force: true });
  }
}

await run({ skipBuild, task: generate });
