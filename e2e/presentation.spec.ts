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
 * Modo apresentação (§45, ADR-0035): tela cheia, quatro telas (painel, corpo 3D, timeline, relatório)
 * navegáveis pelo teclado, Esc sai, foco no título de cada tela, entra SEMPRE com o modo privacidade ligado
 * e, ao sair, volta ao estado anterior. Dados de demonstração por padrão; "meus dados" só com consentimento.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const UNIT_VALUE = /\d+(,\d+)?\s?(kg|cm|kcal)\b/;
const PRIVACY_COOKIE = '__Host-hm_privacy';

async function privacyCookie(page: Page) {
  return (await page.context().cookies()).find((c) => c.name === PRIVACY_COOKIE)?.value;
}

async function expectScreen(page: Page, name: string, position: number) {
  const title = page.getByRole('heading', { level: 2, name, exact: true });
  await expect(title).toBeVisible();
  await expect(title).toBeFocused();
  await expect(page.getByText(`Tela ${position} de 4: ${name}`)).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(UNIT_VALUE);
  expect(text).not.toMatch(/\bIMC\b/);
  // O conteúdo rola por baixo do cabeçalho e da navegação fixos (sticky): conforme o layout do dia (dados
  // sintéticos relativos à data), um selo pode cair na borda da barra e o axe o acusa como `target-size`
  // parcialmente coberto, embora a pessoa o alcance rolando. Durante a análise as barras ficam no fluxo.
  const unstick = await page.addStyleTag({
    content: 'header, nav { position: static !important; }',
  });
  const axe = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  await unstick.evaluate((style) => style.remove());
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual(
    [],
  );
}

test.describe('demo público', () => {
  test.use({ storageState: DEMO_TOUR_SEEN_STATE });

  test('entra pelo menu de ajuda com o modo privacidade ligado, navega pelo teclado e Esc sai', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Ajuda' }).click();
    await page.getByRole('button', { name: 'Modo apresentação' }).click();
    await expect(page).toHaveURL(/\/demo\/apresentacao$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Modo apresentação' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Modo privacidade', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(await privacyCookie(page)).toBe('on');
    // Marca da apresentação: cookie de sessão, sem identificador (o prazo de 4 h vai no valor).
    const presenting = (await page.context().cookies()).find(
      (c) => c.name === '__Host-hm_presenting',
    );
    expect(presenting?.expires).toBe(-1);
    expect(presenting?.value).toMatch(/^on\.\d+$/);
    await expect(page.getByRole('banner').getByText(/^DEMO:/)).toBeVisible();

    await expectScreen(page, 'Painel', 1);
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/tela=twin/);
    await expectScreen(page, 'Corpo 3D', 2);
    await page.keyboard.press('ArrowRight');
    await expectScreen(page, 'Timeline', 3);
    await page.keyboard.press('End');
    await expectScreen(page, 'Relatório do mês', 4);
    await expect(page.locator('main')).toContainText('não é laudo nem avaliação clínica');
    await page.keyboard.press('ArrowLeft');
    await expectScreen(page, 'Timeline', 3);
    // Botões também navegam.
    await page.getByRole('link', { name: /^Anterior/ }).click();
    await expectScreen(page, 'Corpo 3D', 2);

    await page.keyboard.press('Escape');
    // O aviso aparece uma vez, recebe o foco e o parâmetro sai da URL.
    await expect(
      page.getByText('Você saiu da apresentação. O modo privacidade continua ligado'),
    ).toBeFocused();
    await expect(page).toHaveURL(/\/demo$/);
    // Antes estava desligado, mas ao sair o modo CONTINUA ligado, com aviso e botão para desligar (OI-36 d).
    expect(await privacyCookie(page)).toBe('on');
    await expect(
      page.getByText('Você saiu da apresentação. O modo privacidade continua ligado'),
    ).toBeVisible();
    expect(await page.locator('main').innerText()).not.toMatch(UNIT_VALUE);
    await page.getByRole('button', { name: 'Desligar o modo privacidade' }).click();
    await expect.poll(() => privacyCookie(page)).toBe('off');
    await expect(page.getByText('Modo privacidade ativo.')).toHaveCount(0);
    await expect(page.locator('main')).toContainText(UNIT_VALUE);
  });

  test('o endereço direto passa pela entrada antes de mostrar dados', async ({ page }) => {
    await page.goto('/demo/apresentacao?tela=twin');
    await expect(page.getByRole('heading', { level: 1, name: 'Modo apresentação' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
    await page.getByRole('button', { name: 'Começar apresentação' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Painel' })).toBeVisible();
    expect(await privacyCookie(page)).toBe('on');
  });

  test('apresentação abandonada pelo voltar não pula a entrada depois de mudar o modo no shell', async ({
    page,
  }) => {
    await page.goto('/demo/apresentacao');
    await page.getByRole('button', { name: 'Começar apresentação' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Painel' })).toBeVisible();
    // Sai sem o botão "Sair" e desliga o modo no shell: a apresentação aberta é esquecida (revisão M1).
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Desligar o modo privacidade' }).click();
    await expect.poll(() => privacyCookie(page)).toBe('off');
    await expect
      .poll(async () =>
        (await page.context().cookies()).some((c) => c.name === '__Host-hm_presenting'),
      )
      .toBe(false);
    await page.goto('/demo/apresentacao?tela=twin');
    await expect(page.getByRole('button', { name: 'Começar apresentação' })).toBeVisible();
  });

  for (const viewport of [
    { width: 320, height: 640 },
    { width: 1920, height: 1080 },
  ]) {
    test(`sem rolagem horizontal a ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/demo/apresentacao');
      await page.getByRole('button', { name: 'Começar apresentação' }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Painel' })).toBeVisible();
      for (const tela of ['painel', 'twin', 'timeline', 'relatorio']) {
        await page.goto(`/demo/apresentacao?tela=${tela}`);
        await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, tela).toBeLessThanOrEqual(0);
      }
    });
  }
});

test.describe('conta', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('"meus dados" opcional; desligado dentro do deck, sair liga de novo e avisa', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const email = e2eEmail('apresentacao');
    const userId = await createVerifiedUser(email);
    await seedSyntheticHealthData(userId);
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await loginWithOwnIp(page, email);
    await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();

    // Entra com o modo desligado no shell; desliga também dentro da apresentação; ao sair, fica ligado.
    expect(await privacyCookie(page)).toBeUndefined();
    await page.getByRole('button', { name: 'Ajuda' }).click();
    await page.getByRole('button', { name: 'Modo apresentação' }).click();
    await expect(page).toHaveURL(/\/apresentacao$/);
    await expect(page.getByRole('link', { name: /Demonstração/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(page.getByRole('banner').getByText(/^DEMO:/)).toBeVisible();

    await page.getByRole('link', { name: 'Meus dados' }).click();
    await expect(page).toHaveURL(/dados=meus/);
    await expect(page.getByRole('banner').getByText(/^DEMO:/)).toHaveCount(0);
    await expectScreen(page, 'Painel', 1);
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/tela=twin&dados=meus/);
    await expectScreen(page, 'Corpo 3D', 2);
    await expect(page.locator('main')).toContainText('forma de referência');

    await page.getByRole('button', { name: 'Modo privacidade', exact: true }).click();
    await expect.poll(() => privacyCookie(page)).toBe('off');
    await page.getByRole('button', { name: 'Sair da apresentação' }).click();
    await expect(
      page.getByText('Você saiu da apresentação. O modo privacidade continua ligado'),
    ).toBeFocused();
    await expect(page).toHaveURL(/\/inicio$/);
    expect(await privacyCookie(page)).toBe('on');
    await expect(page.getByText('Modo privacidade ativo.')).toBeVisible();
    await expect(
      page.getByText('Você saiu da apresentação. O modo privacidade continua ligado'),
    ).toBeVisible();
    expect(await page.locator('main').innerText()).not.toMatch(UNIT_VALUE);
    // Recarregar não repete o aviso.
    await page.reload();
    await expect(page.getByText('Modo privacidade ativo.')).toBeVisible();
    await expect(
      page.getByText('Você saiu da apresentação. O modo privacidade continua ligado'),
    ).toHaveCount(0);
    await context.close();
  });

  test('sem consentimento de dados de bem-estar, só a demonstração', async ({ browser }) => {
    const email = e2eEmail('apresentacao-sem-consentimento');
    await createVerifiedUser(email, undefined, { purposes: [] });
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await loginWithOwnIp(page, email);
    await page.goto('/apresentacao');
    await page.getByRole('button', { name: 'Começar apresentação' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Painel' })).toBeVisible();
    await page.goto('/apresentacao?dados=meus');
    await expect(page.getByRole('link', { name: 'Meus dados' })).toHaveCount(0);
    await expect(page.getByText(/a conta precisa estar no modo de dados próprios/)).toBeVisible();
    await expect(page.getByRole('banner').getByText(/^DEMO:/)).toBeVisible();
    await context.close();
  });
});
