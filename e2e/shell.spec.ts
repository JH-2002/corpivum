import { PRODUCT_NAME } from '../src/config/product';
import { expect, test } from '@playwright/test';
import { createVerifiedUser, e2eEmail, loginWithOwnIp } from './fixtures';
import { choosePeriod, expectPeriod } from './period';

test.describe('seletor de período global (§10)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('mostra o intervalo em texto e persiste ao trocar de página', async ({ page }) => {
    await page.goto('/inicio');
    await expectPeriod(page, '30 dias');
    await choosePeriod(page, '7 dias');
    await expect(page.getByText(/^\d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link', { name: 'Sono' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sono' })).toBeVisible();
    await expectPeriod(page, '7 dias');

    await page.reload();
    await expectPeriod(page, '7 dias');
  });

  test('personalizado valida o intervalo e aplica datas válidas', async ({ page }) => {
    await page.goto('/inicio');
    await choosePeriod(page, 'Personalizado');
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
  test('tema único escuro, sem seletor (ADR-0046)', async ({ page }) => {
    await page.goto('/configuracoes');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('radio', { name: /claro|escuro|sistema/i })).toHaveCount(0);
    const scheme = await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    );
    expect(scheme).toBe('dark');
  });
});

test('/ redireciona para /inicio', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/inicio$/);
});

test.describe('foco no título na troca de rota (9b, WCAG 2.4.3 e 2.4.7)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('o foco vai ao <h1>; sem moldura depois de clique, com anel depois de tecla', async ({
    page,
  }) => {
    await page.goto('/inicio');
    const sidebar = page.getByRole('navigation', { name: 'Navegação principal' });
    const outline = () =>
      page.getByRole('heading', { level: 1 }).evaluate((el) => getComputedStyle(el).outlineStyle);

    await sidebar.getByRole('link', { name: 'Sono' }).click();
    const sleep = page.getByRole('heading', { level: 1, name: 'Sono' });
    await expect(sleep).toBeFocused();
    expect(await outline()).toBe('none');

    await sidebar.getByRole('link', { name: 'Hábitos' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Hábitos' })).toBeFocused();
    expect(await outline()).not.toBe('none');
  });
});
