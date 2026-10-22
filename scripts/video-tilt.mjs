/**
 * Vídeo curto (~10 s) do efeito de inclinação dos cartões no início da demo (ADR-0048), para revisão visual.
 * Usa um servidor já rodando (`pnpm dev --port 3200`, ou `VIDEO_BASE`) e salva `capturas/tilt-inicio.webm`
 * (pasta fora do Git). Só dados fictícios da demo pública.
 */
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.VIDEO_BASE ?? 'http://localhost:3200';
const OUT = path.join(ROOT, 'capturas');
const TMP = path.join(OUT, '.video-tmp');
const SIZE = { width: 1440, height: 900 };

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch();
// Aquece a página (compilação do dev server) antes de gravar.
const warm = await browser.newPage();
await warm.goto(`${BASE}/demo`, { waitUntil: 'networkidle', timeout: 120_000 });
await warm.close();

const context = await browser.newContext({
  viewport: SIZE,
  recordVideo: { dir: TMP, size: SIZE },
  storageState: {
    cookies: [],
    origins: [{ origin: BASE, localStorage: [{ name: 'hm_tour_demo_seen', value: '1' }] }],
  },
});
const page = await context.newPage();
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
const cards = page.locator('[data-tilt]');
await cards.first().waitFor();
await cards.first().scrollIntoViewIfNeeded();
await page.mouse.move(SIZE.width / 2, 40);
await page.waitForTimeout(600);

/** Passa o mouse em arco sobre o cartão: canto superior esquerdo → inferior direito → centro. */
async function sweep(index) {
  const box = await cards.nth(index).boundingBox();
  if (!box) return;
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  for (const [fx, fy] of [
    [0.1, 0.15],
    [0.9, 0.2],
    [0.85, 0.85],
    [0.15, 0.8],
    [0.5, 0.5],
  ]) {
    const [x, y] = at(fx, fy);
    await page.mouse.move(x, y, { steps: 18 });
    await page.waitForTimeout(120);
  }
}

const count = Math.min(await cards.count(), 4);
for (let i = 0; i < count; i += 1) {
  const visible = await cards.nth(i).isVisible();
  if (!visible) continue;
  await cards.nth(i).scrollIntoViewIfNeeded();
  await sweep(i);
}
await page.mouse.move(SIZE.width / 2, 40, { steps: 15 });
await page.waitForTimeout(700);

const video = page.video();
await context.close();
await browser.close();
const file = path.join(OUT, 'tilt-inicio.webm');
rmSync(file, { force: true });
renameSync(await video.path(), file);
rmSync(TMP, { recursive: true, force: true });
console.log(`vídeo: ${file}`);
