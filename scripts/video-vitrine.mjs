// Vídeo de vitrine (LinkedIn): `pnpm video:vitrine`. MP4 H.264 1920×1080, 30 fps, sem áudio, entre 40 e 60 s, em
// `docs/readme/vitrine.mp4` (fora do Git). Build de produção no modo só demo (`scripts/demo-server.mjs`; pule o build
// com --sem-build se o build já é desse modo): dados 100% fictícios, sem banco.
// Gravação pelo screencast do Chrome (JPEG de alta qualidade, quadro a quadro, com o horário de chegada) em vez do
// vídeo do Playwright, que tem pouca nitidez e não mostra o cursor; o cursor é desenhado na página. As cargas de
// página ficam fora da gravação (pausa durante a navegação). O FFmpeg monta o MP4 com a duração real de cada quadro.
// Roteiro: início com o twin girando e uma região acesa → cartões (inclinação e contagem) → troca de regiões →
// twin completo e Antes × Agora → Sono → Hábitos (só leitura na demo) → Timeline com "Ver mais" → apresentação.
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { BROWSER_ARGS, ROOT, createDemoServer, settle, tourSeenState } from './demo-server.mjs';
import { ffmpeg, ffmpegBin } from './ffmpeg.mjs';
import { VITRINE_FILE } from './video-vitrine-file.mjs';

const OUT = path.join(ROOT, 'docs', 'readme', VITRINE_FILE);
/** Quadros e lista do FFmpeg: dentro de `capturas/`, fora do Git, apagados no fim. */
const TMP = path.join(ROOT, 'capturas', '.video-vitrine');
const skipBuild = process.argv.includes('--sem-build');
const { base: BASE, run } = createDemoServer({
  label: 'video:vitrine',
  port: Number(process.env.VIDEO_VITRINE_PORT ?? 3302),
  portVar: 'VIDEO_VITRINE_PORT',
});

/** Janela de 1280×720 com densidade 1,5: quadros de 1920×1080 com a interface no tamanho de um notebook. */
const VIEWPORT = { width: 1280, height: 720 };
const SCALE = 1.5;
const FPS = 30;
const MIN_SECONDS = 40;
const MAX_SECONDS = 60;
const JPEG_QUALITY = 92;

/** Cursor desenhado na página (seta e um pulso no clique); não recebe eventos. */
function installCursor() {
  const draw = () => {
    if (document.getElementById('vitrine-cursor')) return;
    const cursor = document.createElement('div');
    cursor.id = 'vitrine-cursor';
    cursor.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 13.8 L10.6 20.5 L13.4 19.2 L10.4 12.6 L16.5 12.6 Z" fill="#fff" stroke="#0b1118" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(cursor.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      zIndex: '2147483647',
      pointerEvents: 'none',
      transform: `translate(${window.__vitrineX ?? -40}px, ${window.__vitrineY ?? -40}px)`,
      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))',
      transition: 'scale 120ms ease-out',
    });
    document.documentElement.appendChild(cursor);
  };
  addEventListener(
    'mousemove',
    (event) => {
      window.__vitrineX = event.clientX;
      window.__vitrineY = event.clientY;
      draw();
      document.getElementById('vitrine-cursor').style.transform =
        `translate(${event.clientX}px, ${event.clientY}px)`;
    },
    true,
  );
  addEventListener('mousedown', () => {
    const cursor = document.getElementById('vitrine-cursor');
    if (cursor) cursor.style.scale = '0.82';
  });
  addEventListener('mouseup', () => {
    const cursor = document.getElementById('vitrine-cursor');
    if (cursor) cursor.style.scale = '1';
  });
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', draw);
  else draw();
}

/** Grava quadros do screencast com o horário de chegada; `pause()`/`resume()` deixam as cargas de fora. */
async function createRecorder(page) {
  const cdp = await page.context().newCDPSession(page);
  /** Trechos gravados: cada um com os quadros `{ file, at }` e o fim. */
  const segments = [];
  let current = null;
  let count = 0;
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (!current) return;
    count += 1;
    const file = path.join(TMP, `q${String(count).padStart(6, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    current.frames.push({ file, at: performance.now() });
  });
  const start = async () => {
    current = { frames: [], end: 0 };
    // Ao começar, o screencast manda o quadro atual mesmo sem mudança na tela.
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: JPEG_QUALITY,
      maxWidth: VIEWPORT.width * SCALE,
      maxHeight: VIEWPORT.height * SCALE,
      everyNthFrame: 1,
    });
  };
  const stop = async () => {
    await cdp.send('Page.stopScreencast');
    current.end = performance.now();
    if (current.frames.length) segments.push(current);
    current = null;
  };
  /** Segundos já gravados (trechos fechados e o atual). */
  const seconds = () =>
    [...segments, ...(current ? [{ ...current, end: performance.now() }] : [])].reduce(
      (sum, segment) => sum + (segment.frames.length ? segment.end - segment.frames[0].at : 0),
      0,
    ) / 1000;
  return { resume: start, pause: stop, segments: () => segments, seconds };
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Chama `step(k)` com k de 0 a 1 (com aceleração suave) ao longo de `ms` de relógio: com o 3D por software cada passo
 * demora mais que um quadro, então o progresso vem do tempo, não da contagem de passos.
 */
async function animate(page, ms, step) {
  const start = performance.now();
  for (;;) {
    const t = Math.min(1, (performance.now() - start) / ms);
    await step(ease(t));
    if (t >= 1) return;
    await page.waitForTimeout(12);
  }
}

/** Move o mouse devagar, com aceleração suave, em `ms`. */
async function glideMouse(page, mouse, x, y, ms = 900) {
  const from = { ...mouse };
  await animate(page, ms, (k) =>
    page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k),
  );
  mouse.x = x;
  mouse.y = y;
}

/** Centro (ou ponto relativo `fx`, `fy`) de um elemento visível. */
async function pointIn(locator, fx = 0.5, fy = 0.5) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('elemento fora da tela');
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** Altura coberta pelas barras fixas do topo (aviso da demo, cabeçalho, período). */
async function headerBottom(page) {
  return page.evaluate(() => {
    const bars = [...document.querySelectorAll('body *')]
      .filter((node) => ['sticky', 'fixed'].includes(getComputedStyle(node).position))
      .map((node) => node.getBoundingClientRect())
      .filter(
        (r) => r.top <= 1 && r.width > window.innerWidth / 2 && r.height < window.innerHeight / 2,
      );
    return Math.max(0, ...bars.map((r) => r.bottom));
  });
}

/** Rola até o elemento ficar logo abaixo das barras fixas, aos poucos (`ms` = 0 rola de uma vez). */
async function scrollTo(page, locator, ms = 1200) {
  const covered = await headerBottom(page);
  const target = await locator
    .first()
    .evaluate((el, c) => el.getBoundingClientRect().top + window.scrollY - c - 16, covered);
  const from = await page.evaluate(() => window.scrollY);
  if (!ms) return page.evaluate((y) => window.scrollTo(0, y), target);
  await animate(page, ms, (k) =>
    page.evaluate((y) => window.scrollTo(0, y), from + (target - from) * k),
  );
}

/** Arrasta o modelo 3D devagar, de um lado ao outro do canvas. */
async function spinTwin(page, mouse, canvas, ms) {
  const start = await pointIn(canvas, 0.3, 0.5);
  const end = await pointIn(canvas, 0.75, 0.5);
  await glideMouse(page, mouse, start.x, start.y, 600);
  await page.mouse.down();
  await glideMouse(page, mouse, end.x, end.y, ms);
  await page.mouse.up();
}

/** Clica num elemento depois de levar o mouse até ele devagar. */
async function slowClick(page, mouse, locator, ms = 800) {
  const target = locator.first();
  const point = await pointIn(target);
  await glideMouse(page, mouse, point.x, point.y, ms);
  await page.waitForTimeout(250);
  await target.click();
}

/** Navega por um link do menu com a gravação pausada durante a carga. */
async function navigate(page, mouse, recorder, link, prepare) {
  await slowClick(page, mouse, link);
  await recorder.pause();
  await page.waitForLoadState('load');
  await settle(page);
  if (prepare) await prepare();
  // O cursor aparece no lugar de antes.
  await page.mouse.move(mouse.x + 1, mouse.y);
  await page.mouse.move(mouse.x, mouse.y);
  await recorder.resume();
}

async function script(page, recorder) {
  const mouse = { x: VIEWPORT.width * 0.62, y: VIEWPORT.height * 0.4 };
  const nav = page.getByRole('navigation').first();
  const pause = (ms) => page.waitForTimeout(ms);
  const section = (name) =>
    console.log(`video:vitrine: ${recorder.seconds().toFixed(1).padStart(5)} s  ${name}`);

  section('início: twin girando');
  await page.goto(`${BASE}/demo`);
  await settle(page);
  const hero = page.locator('[data-tour="twin-hero"]');
  await scrollTo(page, hero, 0);
  await page.getByRole('button', { name: 'Cintura', exact: true }).first().click();
  await page.mouse.move(mouse.x, mouse.y);
  await pause(600);
  await recorder.resume();
  await pause(1200);
  await spinTwin(page, mouse, hero.locator('canvas').first(), 3600);
  await pause(2200);

  section('cartões: contagem e inclinação');
  await scrollTo(page, page.locator('[data-tour="score"]'), 1200);
  await pause(900);
  await scrollTo(page, page.locator('[data-tour="cards"]'), 1000);
  await pause(600);
  for (const card of (await page.locator('article[data-tilt]').all()).slice(0, 2)) {
    const a = await pointIn(card, 0.25, 0.3);
    const b = await pointIn(card, 0.75, 0.7);
    await glideMouse(page, mouse, a.x, a.y, 600);
    await glideMouse(page, mouse, b.x, b.y, 800);
  }
  await pause(1500);

  section('troca de regiões');
  await scrollTo(page, hero, 1200);
  for (const name of ['Peito', 'Braço']) {
    await slowClick(page, mouse, page.getByRole('button', { name, exact: true }), 800);
    await pause(1100);
  }

  section('twin completo e Antes × Agora');
  await navigate(
    page,
    mouse,
    recorder,
    page.getByRole('link', { name: 'Abrir twin completo' }),
    () => scrollTo(page, page.getByRole('heading', { name: 'Seu corpo em 3D', exact: true }), 0),
  );
  await pause(2000);
  // Os dois modelos inteiros na tela; giram juntos.
  const compare = page.locator('canvas').nth(1);
  await scrollTo(page, compare, 1400);
  await pause(800);
  await spinTwin(page, mouse, compare, 1600);
  await pause(1400);

  section('sono');
  await navigate(page, mouse, recorder, nav.getByRole('link', { name: 'Sono', exact: true }));
  await pause(800);
  await scrollTo(page, page.locator('.recharts-wrapper').first(), 1200);
  await pause(2200);

  section('hábitos');
  await navigate(page, mouse, recorder, nav.getByRole('link', { name: 'Hábitos', exact: true }));
  await pause(800);
  // Grade dos últimos 7 dias do primeiro hábito (na demo, só o estado de cada dia).
  const week = page.locator('ul:has(> li > span > span.tabular)').first();
  await scrollTo(page, week.locator('xpath=ancestor::li[1]'), 1000);
  for (const day of (await week.locator('> li').all()).slice(0, 4)) {
    const point = await pointIn(day);
    await glideMouse(page, mouse, point.x, point.y, 350);
  }
  await pause(2000);

  section('timeline com "Ver mais"');
  await navigate(page, mouse, recorder, nav.getByRole('link', { name: 'Timeline', exact: true }));
  await pause(1000);
  for (const row of (await page.locator('li.hm-row').all()).slice(0, 1)) {
    const point = await pointIn(row, 0.4, 0.5);
    await glideMouse(page, mouse, point.x, point.y, 600);
  }
  const more = page.getByRole('button', { name: 'Ver mais semanas' });
  await scrollTo(page, more, 1200);
  await slowClick(page, mouse, more, 700);
  await pause(2200);

  section('modo apresentação');
  await recorder.pause();
  await page.goto(`${BASE}/demo/apresentacao`);
  await settle(page);
  await page.mouse.move(mouse.x, mouse.y);
  await recorder.resume();
  await pause(800);
  await navigate(page, mouse, recorder, page.getByRole('button', { name: 'Começar apresentação' }));
  await pause(2200);
  // Próxima tela: o corpo 3D.
  const next = page.getByRole('button', { name: 'Próxima' });
  await slowClick(page, mouse, next.or(page.getByRole('link', { name: 'Próxima' })), 700);
  await page.waitForLoadState('networkidle');
  await pause(2800);
  await recorder.pause();
  section('fim');
}

/** Lista do FFmpeg (concat) com a duração real de cada quadro; devolve a duração total em segundos. */
function writeConcat(segments) {
  const lines = ['ffconcat version 1.0'];
  let total = 0;
  for (const { frames, end } of segments) {
    frames.forEach((frame, i) => {
      const next = frames[i + 1]?.at ?? end;
      const seconds = Math.max(0.001, (next - frame.at) / 1000);
      total += seconds;
      lines.push(`file '${path.basename(frame.file)}'`, `duration ${seconds.toFixed(4)}`);
    });
  }
  // O demuxer ignora a duração do último arquivo sem uma linha repetida.
  const last = segments.at(-1).frames.at(-1);
  lines.push(`file '${path.basename(last.file)}'`);
  writeFileSync(path.join(TMP, 'lista.txt'), lines.join('\n'));
  return total;
}

async function record() {
  ffmpegBin();
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  try {
    const browser = await chromium.launch({ args: BROWSER_ARGS });
    let segments;
    try {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        colorScheme: 'dark',
        reducedMotion: 'no-preference',
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        storageState: tourSeenState(BASE),
      });
      await context.addInitScript(installCursor);
      const page = await context.newPage();
      const recorder = await createRecorder(page);
      await script(page, recorder);
      segments = recorder.segments();
    } finally {
      await browser.close();
    }
    const seconds = writeConcat(segments);
    const frames = segments.reduce((sum, segment) => sum + segment.frames.length, 0);
    console.log(
      `video:vitrine: ${segments.length} trechos, ${frames} quadros em ${seconds.toFixed(1)} s ` +
        `(${(frames / seconds).toFixed(1)} quadros/s do navegador)`,
    );
    if (seconds < MIN_SECONDS || seconds > MAX_SECONDS)
      throw new Error(
        `o vídeo ficou com ${seconds.toFixed(1)} s; ajuste as pausas do roteiro (${MIN_SECONDS}–${MAX_SECONDS} s)`,
      );
    mkdirSync(path.dirname(OUT), { recursive: true });
    ffmpeg([
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      path.join(TMP, 'lista.txt'),
      '-vf',
      `scale=${VIEWPORT.width * SCALE}:${VIEWPORT.height * SCALE}:flags=lanczos,fps=${FPS},format=yuv420p`,
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '18',
      '-profile:v',
      'high',
      '-r',
      String(FPS),
      '-movflags',
      '+faststart',
      '-an',
      OUT,
    ]);
    const mib = (statSync(OUT).size / 1024 / 1024).toFixed(1);
    console.log(`video:vitrine: ${path.relative(ROOT, OUT)} (${seconds.toFixed(1)} s, ${mib} MiB)`);
  } finally {
    rmSync(TMP, { recursive: true, force: true });
  }
}

await run({ skipBuild, task: record });
