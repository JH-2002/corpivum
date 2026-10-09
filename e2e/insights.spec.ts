import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  createVerifiedUser,
  DEMO_TOUR_SEEN_STATE,
  e2eEmail,
  loginWithOwnIp,
  seedSyntheticHealthData,
} from './fixtures';

/**
 * Camada explicativa (ADR-0025): resumo em texto por regras no topo de cada tela, "Como ler este
 * gráfico", destaques e o tour opcional do painel (primeira visita, pular, reabrir pela ajuda).
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`),
  ).toEqual([]);
}

const MODULES = [
  { path: '/inicio', title: 'Início' },
  { path: '/sono', title: 'Sono' },
  { path: '/habitos', title: 'Hábitos' },
  { path: '/diario', title: 'Diário' },
  { path: '/corpo', title: 'Corpo' },
] as const;

test.describe('resumo e guia dos gráficos (pessoa com dados sintéticos)', () => {
  for (const route of MODULES) {
    test(`${route.path}: resumo de 2 a 4 frases no topo, ligado aos gráficos`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1, name: route.title })).toBeVisible();
      const summary = page.getByRole('region', { name: 'Resumo do período' });
      await expect(summary).toBeVisible();
      const sentences = summary.locator('[id$="-text"] p');
      expect(await sentences.count()).toBeGreaterThanOrEqual(2);
      expect(await sentences.count()).toBeLessThanOrEqual(4);
      await expect(summary).toContainText('sem IA');

      // Os gráficos da tela apontam para o resumo como descrição em texto.
      const textId = await summary.locator('[id$="-text"]').getAttribute('id');
      const charts = page.locator(`section[aria-describedby="${textId}"]`);
      if ((await charts.count()) > 0) {
        await charts.first().getByText('Como ler este gráfico').click();
        await expect(charts.first().getByText('O que fazer com isso')).toBeVisible();
      }
    });
  }

  test('acessível com o resumo, os destaques e o guia abertos', async ({ page }) => {
    await page.goto('/sono');
    await page.getByText('Como ler este gráfico').first().click();
    await expect(page.getByRole('heading', { name: 'Destaques do período' })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe('tour do painel', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('abre na primeira visita, pode ser pulado e é reaberto pelo menu de ajuda', async ({
    page,
  }) => {
    const email = e2eEmail('tour');
    const userId = await createVerifiedUser(email, undefined, { tourSeen: false });
    await seedSyntheticHealthData(userId);
    await loginWithOwnIp(page, email);

    const tour = page.getByRole('dialog', { name: 'Boas-vindas ao seu painel' });
    await expect(tour).toBeVisible();
    await expect(page.getByText(/^Passo 1 de \d$/)).toBeVisible();
    await expectNoAxeViolations(page);

    // Teclado: avança e pula com Esc.
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Resumo do período' })).toBeVisible();
    await expect(page.locator('[data-tour-active]')).toHaveAttribute('data-tour', 'summary');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // Não volta sozinho.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Reaberto pela ajuda, de outra tela.
    await page.goto('/sono');
    await page.getByRole('button', { name: 'Ajuda' }).click();
    await expect(page.getByText('O que significam os selos')).toBeVisible();
    await page.getByRole('link', { name: 'Fazer o tour do painel' }).click();
    await expect(tour).toBeVisible();
    await page.getByRole('button', { name: 'Pular tour' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page).toHaveURL(/\/inicio$/);
  });

  test('demo público: lembra só no navegador', async ({ page }) => {
    await page.goto('/demo');
    const tour = page.getByRole('dialog', { name: 'Boas-vindas ao seu painel' });
    await expect(tour).toBeVisible();
    await page.getByRole('button', { name: 'Pular tour' }).click();
    await expect(tour).toBeHidden();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Índice de Bem-Estar' })).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  for (const width of [320, 1920]) {
    test(`cabe na tela em ${width}px, sem rolagem horizontal`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/demo?tour=1');
      const tour = page.getByRole('dialog', { name: 'Boas-vindas ao seu painel' });
      await expect(tour).toBeVisible();
      const box = await tour.boundingBox();
      expect(box).not.toBeNull();
      expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= width).toBe(true);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    });
  }
});

test.describe('demo público com o tour já visto', () => {
  test.use({ storageState: DEMO_TOUR_SEEN_STATE });

  test('resumos com selo DEMO em todas as telas', async ({ page }) => {
    for (const path of ['/demo', '/demo/sono', '/demo/habitos', '/demo/diario', '/demo/corpo']) {
      await page.goto(path);
      const summary = page.getByRole('region', { name: 'Resumo do período' });
      await expect(summary).toBeVisible();
      await expect(summary.getByRole('button', { name: 'Origem do dado: Demo' })).toBeVisible();
    }
  });
});
