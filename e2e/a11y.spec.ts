import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ROUTES } from './routes';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** LEG-X01: nenhuma violação WCAG 2.2 AA detectável pelo axe, nos dois temas. */
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`acessibilidade (axe) — tema ${colorScheme}`, () => {
    test.use({ colorScheme });

    for (const route of ROUTES) {
      test(`${route.path} sem violações`, async ({ page }) => {
        await page.goto(route.path);
        await expect(page.getByRole('heading', { level: 1, name: route.title })).toBeVisible();
        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`),
        ).toEqual([]);
      });
    }

    test('registro rápido aberto sem violações', async ({ page }) => {
      await page.goto('/inicio');
      await page.getByRole('button', { name: 'Registrar' }).first().click();
      await expect(page.getByRole('dialog', { name: 'O que você quer registrar?' })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  });
}

test.describe('acessibilidade dos estados de tela', () => {
  for (const state of ['loading', 'error', 'no-data', 'partial'] as const) {
    test(`?state=${state} sem violações`, async ({ page }) => {
      await page.goto(`/sono?state=${state}`);
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }
});
