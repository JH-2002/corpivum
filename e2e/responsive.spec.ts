import { expect, test } from '@playwright/test';
import { ROUTES, VIEWPORTS } from './routes';

/** Shell navegável de 320px a 1920px, sem rolagem horizontal (§42, critério da Fase 0). */
for (const viewport of VIEWPORTS) {
  test.describe(`viewport ${viewport.width}px`, () => {
    test.use({ viewport });

    test('sem rolagem horizontal em nenhuma rota', async ({ page }) => {
      // 18 rotas, várias com dados e gráficos: mais tempo que o padrão por teste.
      test.setTimeout(120_000);
      for (const route of ROUTES) {
        await page.goto(route.path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `rolagem horizontal em ${route.path}`).toBeLessThanOrEqual(0);
      }
    });

    test('navegação adequada ao tamanho de tela', async ({ page }) => {
      await page.goto('/inicio');
      const sidebar = page.getByRole('navigation', { name: 'Navegação principal' });
      const bottom = page.getByRole('navigation', { name: 'Navegação inferior' });
      if (viewport.width < 768) {
        await expect(bottom).toBeVisible();
        await expect(sidebar).toBeHidden();
        // Título legível e registro rápido só na barra inferior.
        await expect(
          page.getByRole('banner').getByRole('button', { name: 'Registrar' }),
        ).toBeHidden();
        const h1 = page.getByRole('heading', { level: 1, name: 'Início' });
        expect(await h1.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        await bottom.getByRole('link', { name: 'Mais' }).click();
        await expect(page).toHaveURL(/\/mais$/);
        await page.getByRole('link', { name: 'Sono' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Sono' })).toBeVisible();
      } else {
        await expect(sidebar).toBeVisible();
        await expect(bottom).toBeHidden();
        await sidebar.getByRole('link', { name: 'Sono' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Sono' })).toBeVisible();
        await expect(sidebar.getByRole('link', { name: 'Sono' })).toHaveAttribute(
          'aria-current',
          'page',
        );
      }
    });
  });
}

test.describe('sidebar recolhível no tablet', () => {
  test.use({ viewport: { width: 800, height: 1024 } });

  test('alterna entre recolhida e expandida mantendo nomes acessíveis', async ({ page }) => {
    await page.goto('/inicio');
    const toggle = page.getByRole('button', { name: 'Expandir menu lateral' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const sidebar = page.getByRole('navigation', { name: 'Navegação principal' });
    await expect(sidebar.getByRole('link', { name: 'Diário' })).toBeVisible();
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Recolher menu lateral' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(sidebar.getByText('Diário')).toBeVisible();
  });
});
