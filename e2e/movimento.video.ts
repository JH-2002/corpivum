import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Vídeo de revisão do movimento (9f, ADR-0055): `pnpm video:movimento` (build de produção antes). ~30 s no desktop,
 * salvo em `capturas/movimento-9f.webm` (pasta fora do Git). Telas da demo pública (dados fictícios), menos o
 * "marcar um dia" de Hábitos: na demo o check é só leitura, então esse trecho usa a pessoa sintética do e2e
 * (`auth.setup.ts`, dados 100% sintéticos). Não roda nas suítes normais (projeto `video` próprio).
 */
const SIZE = { width: 1440, height: 900 };
const OUT = path.resolve('capturas', 'movimento-9f.webm');

test.use({ viewport: SIZE, video: { mode: 'on', size: SIZE } });

/** Rola devagar até o elemento, para a gravação mostrar a entrada dos números e gráficos. */
async function glideTo(page: Page, selector: string) {
  const top = await page
    .locator(selector)
    .first()
    .evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 160);
  const from = await page.evaluate(() => window.scrollY);
  const steps = 24;
  for (let i = 1; i <= steps; i += 1) {
    await page.evaluate((y) => window.scrollTo(0, y), from + ((top - from) * i) / steps);
    await page.waitForTimeout(25);
  }
}

/** Passa o mouse em arco sobre o elemento. */
async function sweep(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return;
  for (const [fx, fy] of [
    [0.15, 0.2],
    [0.85, 0.25],
    [0.8, 0.8],
    [0.5, 0.5],
  ] as const) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 14 });
    await page.waitForTimeout(80);
  }
}

test('movimento e interatividade da 9f', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem('hm_tour_demo_seen', '1'));

  // Início: Registrar magnético, contagem dos números e gráficos se desenhando ao rolar, inclinação dos cartões.
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Índice de Bem-Estar' })).toBeAttached();
  await page.locator('[data-twin-hero-ready]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await sweep(page, '[data-magnetic]');
  await page.mouse.move(SIZE.width / 2, 300, { steps: 10 });
  await glideTo(page, '[data-tour="score"]');
  await page.waitForTimeout(1200);
  await glideTo(page, '[data-tour="cards"]');
  await page.waitForTimeout(1000);
  await sweep(page, 'article[data-tilt]');
  await glideTo(page, '[data-tour="chart"]');
  await page.waitForTimeout(1300);
  await page.mouse.move(5, 5, { steps: 8 });

  // Hábitos: marcar um dia (pessoa sintética; na demo o check é só leitura).
  await page.goto('/habitos');
  const day = page.getByRole('button', { name: /^Marcar ".+" como feito em/ }).first();
  await day.scrollIntoViewIfNeeded();
  await day.hover();
  await page.waitForTimeout(500);
  await day.click();
  await page.waitForTimeout(1200);

  // Metas: barras de progresso que enchem ao aparecer.
  await page.goto('/demo/metas');
  await page.waitForTimeout(400);
  await glideTo(page, '[role="progressbar"]');
  await page.waitForTimeout(1300);

  // Timeline: hover nas linhas e "Ver mais" com entrada em sequência só dos itens novos.
  await page.goto('/demo/timeline');
  await page.waitForTimeout(500);
  await sweep(page, 'li.hm-row');
  const more = page.getByRole('button', { name: 'Ver mais semanas' });
  await glideTo(page, 'button:has-text("Ver mais semanas")');
  await more.hover();
  await page.waitForTimeout(300);
  await more.click();
  await page.waitForTimeout(1500);

  // Twin: escolher regiões (troca suave do destaque no 3D).
  await page.goto('/demo/twin');
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  for (const name of ['Cintura', 'Quadril', 'Peito', 'Braço']) {
    const button = page.getByRole('button', { name, exact: true }).first();
    await button.hover();
    await button.click();
    await page.waitForTimeout(900);
  }

  const video = page.video();
  await page.close();
  if (!video) throw new Error('sem gravação');
  mkdirSync(path.dirname(OUT), { recursive: true });
  await video.saveAs(OUT);
  console.log(`vídeo: ${OUT}`);
});
