import { createVerifiedUser, E2E_PASSWORD, e2eEmail, loginWithOwnIp } from './fixtures';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

/**
 * Foco visível = contorno ativo no elemento focado (WCAG 2.4.7). Reavalia por até 2 s: depois de uma navegação
 * pelo cliente, o estilo da tela nova pode chegar um pouco depois do foco.
 */
async function expectVisibleFocus(page: Page) {
  await expect(async () => {
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      // Botão nativo do calendário dentro de um campo de data: o foco fica na parte interna do navegador (que
      // desenha o próprio anel) e o campo não casa com :focus. Conferido à mão no roteiro (docs/qa).
      const isDateInput =
        el instanceof HTMLInputElement && /^(date|datetime-local|time)$/.test(el.type);
      if (isDateInput && !el.matches(':focus'))
        return { style: 'native', width: 2, element: 'picker' };
      const style = getComputedStyle(el);
      const label = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? '';
      return {
        style: style.outlineStyle,
        width: parseFloat(style.outlineWidth),
        element: `${el.tagName.toLowerCase()}[name=${el.getAttribute('name')}] "${label}"`,
      };
    });
    expect(outline).not.toBeNull();
    expect(outline!.style, outline!.element).not.toBe('none');
    expect(outline!.width, outline!.element).toBeGreaterThanOrEqual(2);
  }).toPass({ timeout: 2000 });
}

/** Avança com Tab até o alvo, conferindo o foco visível a cada passo; falha se não chegar em `max` passos. */
async function tabTo(page: Page, target: Locator, max = 60) {
  for (let i = 0; i < max; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
    await expectVisibleFocus(page);
  }
  await expect(target).toBeFocused();
}

/** Pessoa nova, sem dados, numa sessão própria (os testes que gravam não mexem na pessoa do setup). */
async function freshPerson(browser: Browser, name: string) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const email = e2eEmail(name);
  await createVerifiedUser(email);
  await loginWithOwnIp(page, email);
  return { context, page };
}

test.describe('teclado e foco (LEG-X01)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('link "pular para o conteúdo" é o primeiro foco e leva ao <main>', async ({ page }) => {
    await page.goto('/inicio');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await expectVisibleFocus(page);
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
  });

  test('navega pela sidebar só com teclado, com foco sempre visível', async ({ page }) => {
    await page.goto('/inicio');
    const target = page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link', { name: 'Hábitos' });
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab');
      await expectVisibleFocus(page);
      if (await target.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(target).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Hábitos' })).toBeVisible();
  });

  test('registro rápido: abre por teclado, prende o foco e fecha com Esc', async ({ page }) => {
    await page.goto('/inicio');
    const trigger = page.getByRole('banner').getByRole('button', { name: 'Registrar' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'O que você quer registrar?' });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 15; i += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('menu da conta abre, leva à Central de Privacidade e fecha com Esc', async ({ page }) => {
    await page.goto('/inicio');
    const button = page.getByRole('button', { name: 'Menu da conta' });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();

    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Central de Privacidade' }).last()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Central de Privacidade' }),
    ).toBeVisible();
  });

  test('selo de confiabilidade e ações do estado vazio são alcançáveis', async ({ browser }) => {
    // Pessoa sem registros (a do setup tem dados sintéticos desde a Fase 2).
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const email = e2eEmail('teclado-vazio');
    await createVerifiedUser(email);
    await loginWithOwnIp(page, email);
    // Navegação nova: o foco programático volta a ser :focus-visible (o login foi por clique).
    await page.goto('/inicio');
    const cta = page.getByRole('button', { name: 'Fazer o primeiro registro' });
    await cta.focus();
    await expectVisibleFocus(page);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await context.close();
  });
});

test.describe('teclado no mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('botão Registrar da navegação inferior abre o diálogo', async ({ page }) => {
    await page.goto('/inicio');
    const bottom = page.getByRole('navigation', { name: 'Navegação inferior' });
    await bottom.getByRole('button', { name: 'Registrar' }).focus();
    await expectVisibleFocus(page);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

/**
 * 7d: os fluxos críticos do começo ao fim só com teclado (WCAG 2.1.1, 2.4.3, 2.4.7).
 */
test.describe('fluxos críticos só com teclado (7d)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('entrar: e-mail, senha e Enter, com o erro anunciado e focado', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const email = e2eEmail('teclado-login');
    await createVerifiedUser(email);
    await page.context().setExtraHTTPHeaders({
      'x-forwarded-for': `198.51.100.${(Date.now() % 250) + 1}`,
    });
    await page.goto('/entrar');
    await tabTo(page, page.getByLabel('E-mail'));
    await page.keyboard.type(email);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Senha', { exact: true })).toBeFocused();
    await page.keyboard.type('senha errada sintética');
    await page.keyboard.press('Enter');
    await expect(page.locator('form [role="alert"]')).toBeFocused();

    // O e-mail continua preenchido depois do erro (WCAG 3.3.7); a senha volta vazia.
    await expect(page.getByLabel('E-mail')).toHaveValue(email);
    await tabTo(page, page.getByLabel('Senha', { exact: true }), 5);
    await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('');
    await page.keyboard.type(E2E_PASSWORD);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
    await context.close();
  });

  test('registro rápido → sono: escolher, preencher e salvar sem mouse', async ({ browser }) => {
    const { context, page } = await freshPerson(browser, 'teclado-sono');
    await page.goto('/inicio');
    await page.getByRole('banner').getByRole('button', { name: 'Registrar' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'O que você quer registrar?' });
    await tabTo(page, dialog.getByRole('link', { name: 'Sono' }), 10);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Sono' })).toBeVisible();
    // O foco cai no primeiro campo do formulário, não volta ao botão do topo (WCAG 2.4.3).
    const bed = page.getByLabel('Deitei em');
    await expect(bed).toBeFocused();
    await expectVisibleFocus(page);
    // Digitado como uma pessoa faria: o campo (dd/mm/aaaa hh:mm em pt-BR) avança sozinho entre as partes.
    await page.keyboard.type('011020262300');
    await expect(bed).toHaveValue('2026-10-01T23:00');
    const wake = page.getByLabel('Acordei em');
    await tabTo(page, wake, 4);
    await page.keyboard.type('021020260700');
    await expect(wake).toHaveValue('2026-10-02T07:00');
    await tabTo(page, page.getByRole('button', { name: 'Salvar registro' }), 15);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').getByText('Registro salvo.')).toBeVisible();
    await context.close();
  });

  test('meta bloqueada: Enter envia e o foco vai para o aviso, que o leitor de tela anuncia', async ({
    browser,
  }) => {
    const { context, page } = await freshPerson(browser, 'teclado-meta');
    await page.goto('/metas');
    const metric = page.getByLabel('O que acompanhar');
    await tabTo(page, metric);
    await metric.selectOption('weight_kg');
    await tabTo(page, page.getByLabel('Alvo', { exact: true }), 5);
    await page.keyboard.type('40');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Criar meta' }).getByRole('alert')).toBeFocused();
    await context.close();
  });

  test('Central de Privacidade: autorizar e revogar com Enter', async ({ browser }) => {
    const { context, page } = await freshPerson(browser, 'teclado-consent');
    await page.goto('/privacidade');
    const grant = page.getByRole('button', { name: 'Autorizar: Comunicações sobre novidades' });
    await tabTo(page, grant, 120);
    await page.keyboard.press('Enter');
    const revoke = page.getByRole('button', { name: 'Revogar: Comunicações sobre novidades' });
    await expect(revoke).toBeVisible({ timeout: 15_000 });
    await revoke.focus();
    await expectVisibleFocus(page);
    await page.keyboard.press('Enter');
    await expect(grant).toBeVisible();
    await context.close();
  });

  test('diálogo de exclusão: abre por teclado, prende o foco, fecha com Esc e devolve o foco', async ({
    page,
  }) => {
    await page.goto('/privacidade');
    const trigger = page.getByRole('button', { name: 'Excluir minha conta' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Excluir a conta agora?' });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('modo privacidade: liga com Enter e desliga com Espaço, com o estado no aria-pressed', async ({
    browser,
  }) => {
    const { context, page } = await freshPerson(browser, 'teclado-privacidade');
    await page.goto('/inicio');
    const toggle = page.getByRole('button', { name: 'Modo privacidade', exact: true });
    await tabTo(page, toggle);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await context.close();
  });
});
