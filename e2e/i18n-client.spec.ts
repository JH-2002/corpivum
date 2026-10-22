import { expect, test, type Page } from '@playwright/test';
import { DEMO_TOUR_SEEN_STATE, STORAGE_STATE } from './fixtures';
import { DEMO_ROUTES, ROUTES } from './routes';

/**
 * Mensagens por rota (ADR-0052): o navegador recebe só os namespaces de cada página. Se faltar algum, o next-intl
 * avisa no console (MISSING_MESSAGE) e mostra a chave no lugar do texto. Aqui: todas as rotas do app e da demo,
 * com o registro rápido e o menu de ajuda abertos (diálogos do shell).
 */
function missingMessages(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (/MISSING_MESSAGE|IntlError/.test(msg.text())) errors.push(msg.text().slice(0, 200));
  });
  return errors;
}

async function openShellDialogs(page: Page) {
  await page.getByRole('button', { name: 'Registrar' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
}

test.describe('app', () => {
  test.use({ storageState: STORAGE_STATE });
  test('nenhuma mensagem faltando no navegador', async ({ page }) => {
    const errors = missingMessages(page);
    for (const route of ROUTES) {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1, name: route.title })).toBeVisible();
    }
    await page.goto('/inicio');
    await openShellDialogs(page);
    expect(errors).toEqual([]);
  });
});

test.describe('demo', () => {
  test.use({ storageState: DEMO_TOUR_SEEN_STATE });
  test('nenhuma mensagem faltando no navegador', async ({ page }) => {
    const errors = missingMessages(page);
    for (const route of DEMO_ROUTES) {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1, name: route.title })).toBeVisible();
    }
    await page.goto('/demo');
    await openShellDialogs(page);
    await page.goto('/demo/apresentacao');
    await expect(page.getByRole('heading', { level: 1, name: 'Modo apresentação' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
