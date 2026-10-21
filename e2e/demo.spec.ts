import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { DEMO_TOUR_SEEN_STATE, foreignRowsSince } from './fixtures';
import { DEMO_ROUTES, VIEWPORTS } from './routes';

/**
 * Demo público sem login (LEG-X02, §40, ADR-0021): dados fictícios com selo DEMO, sem formulários, sem
 * sessão e sem gravar nada no banco. Acessível (LEG-X01) e responsivo (320–1920px).
 */
test.use({ storageState: DEMO_TOUR_SEEN_STATE });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('o demo não cria sessão nem grava nada no banco', async ({ page, context }) => {
  const start = new Date(Date.now() - 1000);
  for (const route of DEMO_ROUTES) {
    await page.goto(route.path);
    await expect(page.getByRole('heading', { level: 1, name: route.title })).toBeVisible();
  }
  // Troca de período: só a preferência de interface, em cookie de sessão.
  await page.goto('/demo');
  await page.getByLabel('Período', { exact: true }).selectOption('7d');
  await expect(page.getByText(/^\d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
  await expect
    .poll(async () => (await context.cookies()).map((c) => c.name))
    .toContain('__Host-hm_period');

  const cookies = await context.cookies();
  expect(cookies.map((c) => c.name).sort()).toEqual(['__Host-hm_period']);
  const period = cookies[0];
  expect(period?.expires).toBe(-1); // cookie de sessão
  expect(period?.httpOnly).toBe(true);
  const written = await foreignRowsSince(start);
  expect(Object.entries(written).filter(([, n]) => n !== 0)).toEqual([]);
});

test('dados com selo DEMO, sem formulários e com caminho para criar conta', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByRole('banner')).toContainText('DEMO');
  await expect(page.getByRole('heading', { name: 'Índice de Bem-Estar' })).toBeVisible();
  // Todo selo exibido é DEMO.
  const badges = page.getByRole('button', { name: /^Origem do dado:/ });
  expect(await badges.count()).toBeGreaterThan(5);
  for (const name of await badges.allTextContents()) expect(name.trim()).toBe('Demo');
  await expect(page.getByRole('button', { name: 'Pedir revisão' })).toHaveCount(0);

  await page.goto('/demo/sono');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByText(/demonstração pública com dados fictícios/)).toBeVisible();

  await page.goto('/demo');
  await page.getByRole('link', { name: 'Começar com meus próprios dados' }).click();
  await expect(page).toHaveURL(/\/cadastro$/);
});

test('"Como é calculado" explica componentes, pesos e exclusões', async ({ page }) => {
  await page.goto('/demo');
  await page.getByText('Como é calculado', { exact: true }).click();
  const table = page.getByRole('table', { name: /Componentes do Índice de Bem-Estar/ });
  await expect(table).toBeVisible();
  await expect(table.getByText('Regularidade do sono')).toBeVisible();
  await expect(table.getByText('Fora: ainda não registrado no app')).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

// axe do demo nos dois temas: a11y.spec.ts (inventário de todas as páginas, 7d).

test.describe('demo responsivo, sem rolagem horizontal', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      for (const path of ['/demo', '/demo/sono', '/demo/corpo']) {
        await page.goto(path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, path).toBeLessThanOrEqual(0);
      }
    });
  }
});

test('fora do modo só demo, o aviso da demonstração não existe (ADR-0043)', async ({ request }) => {
  // O aviso descreve a demo sem cadastro nem banco e outro responsável: no app completo, seria falso.
  expect((await request.get('/demo/sobre')).status()).toBe(404);
});
