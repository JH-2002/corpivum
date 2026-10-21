import { PRODUCT_NAME } from '../src/config/product';
import { expect, test } from '@playwright/test';
import { createVerifiedUser, e2eEmail, loginWithOwnIp } from './fixtures';

test.describe('seletor de período global (§10)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('mostra o intervalo em texto e persiste ao trocar de página', async ({ page }) => {
    await page.goto('/inicio');
    const select = page.getByLabel('Período', { exact: true });
    await expect(select).toHaveValue('30d');
    await select.selectOption('7d');
    await expect(page.getByText(/^\d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link', { name: 'Sono' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sono' })).toBeVisible();
    await expect(page.getByLabel('Período', { exact: true })).toHaveValue('7d');

    await page.reload();
    await expect(page.getByLabel('Período', { exact: true })).toHaveValue('7d');
  });

  test('personalizado valida o intervalo e aplica datas válidas', async ({ page }) => {
    await page.goto('/inicio');
    await page.getByLabel('Período', { exact: true }).selectOption('custom');
    await page.getByLabel('De', { exact: true }).fill('2026-03-10');
    await page.getByLabel('Até', { exact: true }).fill('2026-03-01');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(
      page.getByText('A data inicial precisa ser anterior', { exact: false }),
    ).toHaveAttribute('role', 'alert');
    await expect(page.getByLabel('De', { exact: true })).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel('Até', { exact: true }).fill('2026-03-20');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText('10/03/2026 a 20/03/2026', { exact: true })).toBeVisible();
  });
});

test.describe('estados de tela (§34)', () => {
  test('conta sem registros: vazio acolhedor, sem gráficos', async ({ browser }) => {
    // Pessoa nova, sem dados (a pessoa do setup tem dados sintéticos desde a Fase 2).
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const email = e2eEmail('vazio');
    await createVerifiedUser(email);
    await loginWithOwnIp(page, email);
    await expect(
      page.getByRole('heading', { name: `Boas-vindas ao ${PRODUCT_NAME}` }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fazer o primeiro registro' })).toBeVisible();
    await expect(page.locator('.recharts-wrapper')).toHaveCount(0);
    await context.close();
  });

  test('loading, error, no-data e partial', async ({ page }) => {
    await page.goto('/sono?state=loading');
    await expect(page.getByRole('status').filter({ hasText: 'Carregando' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    await page.goto('/sono?state=error');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Não foi possível carregar' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Tentar novamente' }).click();
    await expect(page.getByRole('heading', { name: 'Registrar sono' })).toBeVisible();

    await page.goto('/sono?state=no-data');
    await expect(page.getByText('Sem registros neste período')).toBeVisible();

    await page.goto('/sono?state=partial');
    await expect(page.getByText('Dados parciais')).toBeVisible();
  });
});

test.describe('avisos obrigatórios', () => {
  test('rodapé com aviso de bem-estar em todas as páginas do app', async ({ page }) => {
    await page.goto('/inicio');
    await expect(page.getByRole('contentinfo')).toContainText('Não diagnostica, não trata');
  });
});

test.describe('rotas removidas (ADR-0027, ADR-0030)', () => {
  for (const [from, to] of [
    ['/humor', '/inicio'],
    ['/diario', '/inicio'],
    ['/medicamentos', '/inicio'],
    ['/ia', '/inicio'],
    ['/twin/cerebro', '/twin'],
    ['/demo/humor', '/demo'],
    ['/demo/diario', '/demo'],
    ['/demo/twin/cerebro', '/demo/twin'],
  ] as const) {
    test(`${from} leva a ${to}`, async ({ page }) => {
      await page.goto(from);
      await page.waitForURL((url) => url.pathname === to);
      expect(new URL(page.url()).pathname).toBe(to);
    });
  }
});

test.describe('tema', () => {
  test('escolha de tema escuro aplica e persiste', async ({ page }) => {
    await page.goto('/configuracoes');
    await page.getByText('Escuro', { exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByText('Claro', { exact: true }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
});

test('/ redireciona para /inicio', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/inicio$/);
});
