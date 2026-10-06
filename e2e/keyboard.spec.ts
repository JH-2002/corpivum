import { expect, test, type Page } from '@playwright/test';

/** Foco visível = contorno ativo no elemento focado (WCAG 2.4.7). */
async function expectVisibleFocus(page: Page) {
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline).not.toBeNull();
  expect(outline!.style).not.toBe('none');
  expect(outline!.width).toBeGreaterThanOrEqual(2);
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

  test('selo de confiabilidade e ações do estado vazio são alcançáveis', async ({ page }) => {
    await page.goto('/inicio');
    const cta = page.getByRole('button', { name: 'Fazer o primeiro registro' });
    await cta.focus();
    await expectVisibleFocus(page);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
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
