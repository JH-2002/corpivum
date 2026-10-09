import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BODY_ASSETS } from '../src/modules/twin/bodyAssets';
import {
  createVerifiedUser,
  DEMO_TOUR_SEEN_STATE,
  E2E_PASSWORD,
  e2eEmail,
  loginWithOwnIp,
  seedSyntheticHealthData,
} from './fixtures';

/**
 * Fase 3 (ADR-0026): Health Digital Twin. Corpo 3D (datas, regiões, vistas, Antes × Agora; o cérebro 3D
 * saiu na reorientação, ADR-0027), carregamento sob demanda (o dashboard não baixa o
 * three.js), versão 2D sem WebGL, reduced motion, 320px (LEG-X01) e consentimento (LEG-C04).
 */
// WebGL por software (SwiftShader) no navegador headless; os testes "sem WebGL" desligam por script.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`),
  ).toEqual([]);
}

/** Sem WebGL: `getContext('webgl*')` devolve null, como num navegador ou aparelho sem suporte. */
async function disableWebGL(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args) {
      if (String(args[0]).startsWith('webgl')) return null;
      return original.apply(this, args as Parameters<typeof original>);
    } as typeof original;
  });
}

/** Scripts baixados pela página que contêm o three.js. */
function collectThreeScripts(page: Page): string[] {
  const found: string[] = [];
  page.on('response', async (response) => {
    if (response.request().resourceType() !== 'script') return;
    const body = await response.text().catch(() => '');
    if (body.includes('WebGLRenderer')) found.push(response.url());
  });
  return found;
}

const viewer = (page: Page) => page.locator('[data-twin-mode]').first();

/** Pedidos de modelos 3D (/models/*.glb) feitos pela página. */
function collectModelRequests(page: Page): string[] {
  const found: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/models/')) found.push(pathname);
  });
  return found;
}

test.describe('demo público', () => {
  test.use({ storageState: DEMO_TOUR_SEEN_STATE });

  test.describe('com WebGL', () => {
    test('o dashboard não baixa o three.js; a tela do twin baixa sob demanda', async ({ page }) => {
      const three = collectThreeScripts(page);
      await page.goto('/demo');
      await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(three).toEqual([]);

      await page.goto('/demo/twin');
      await expect(viewer(page)).toHaveAttribute('data-twin-mode', '3d');
      await expect(viewer(page).locator('canvas')).toBeVisible();
      await expect.poll(() => three.length).toBeGreaterThan(0);
    });

    test('corpo 3D: vistas, restaurar, datas, regiões e Antes × Agora', async ({ page }) => {
      await page.goto('/demo/twin');
      await expect(page.getByRole('heading', { level: 1, name: 'Health Twin' })).toBeVisible();
      await expect(viewer(page)).toHaveAttribute('data-twin-mode', '3d');
      await expect(page.getByTestId('body-disclaimer')).toContainText('Não é avaliação corporal');
      await expect(page.getByRole('region', { name: 'Resumo do período' })).not.toContainText(
        /IMC/,
      );

      const body = page.getByRole('region', { name: 'Seu corpo em 3D' });
      const front = body.getByRole('button', { name: 'Frente' });
      const side = body.getByRole('button', { name: 'Lado' });
      await expect(front).toHaveAttribute('aria-pressed', 'true');
      await side.click();
      await expect(side).toHaveAttribute('aria-pressed', 'true');
      await body.getByRole('button', { name: 'Girar para a direita' }).click();
      await expect(side).toHaveAttribute('aria-pressed', 'false');
      await body.getByRole('button', { name: 'Restaurar visão' }).click();
      await expect(front).toHaveAttribute('aria-pressed', 'true');

      const slider = body.getByRole('slider', { name: /Data das medidas/ });
      const last = await slider.getAttribute('aria-valuetext');
      await slider.focus();
      await page.keyboard.press('Home');
      await expect(slider).not.toHaveAttribute('aria-valuetext', last ?? '');

      await body.getByRole('button', { name: 'Cintura' }).click();
      await expect(body.getByText(/Circunferência: .* cm|Sem medida informada/)).toBeVisible();

      const table = page.getByRole('table', { name: /Medidas nas duas datas/ });
      await expect(table.getByRole('row', { name: /Peso/ })).toContainText(/subiu|desceu|igual/);
      await page.getByRole('button', { name: 'Ocultar valores' }).click();
      await expect(table.getByRole('row', { name: /Peso/ })).not.toContainText('kg');
      await expectNoAxeViolations(page);
    });

    test('modelo do corpo: os três .glb sempre, só no twin; a escolha fica no navegador (ADR-0028, OI-24)', async ({
      page,
    }) => {
      const all = Object.values(BODY_ASSETS)
        .map((a) => a.file)
        .sort();
      expect(all).toHaveLength(3);
      const models = collectModelRequests(page);
      await page.goto('/demo');
      await page.waitForLoadState('networkidle');
      expect(models).toEqual([]);

      await page.goto('/demo/twin');
      const canvas = viewer(page).locator('canvas');
      await expect(viewer(page)).toHaveAttribute('data-holo-animated', 'true');
      const picker = page.getByRole('group', { name: 'Modelo do corpo' });
      await expect(picker.getByRole('radio', { name: 'Neutro' })).toBeChecked();
      await expect(canvas).toHaveAttribute('data-twin-model', 'neutral');
      // Os três arquivos, qualquer que seja a escolha: pelos pedidos, o servidor não sabe qual corpo a pessoa vê.
      await expect.poll(() => [...new Set(models)].sort()).toEqual(all);
      const response = await page.request.get(all[0] ?? '');
      expect(response.headers()['cache-control']).toContain('immutable');
      expect(response.headers()['content-security-policy']).toBeUndefined();

      const before = models.length;
      await picker.getByRole('radio', { name: 'Feminino' }).check();
      await expect(canvas).toHaveAttribute('data-twin-model', 'feminine');
      expect(models).toHaveLength(before);

      await page.reload();
      await expect(
        page
          .getByRole('group', { name: 'Modelo do corpo' })
          .getByRole('radio', { name: 'Feminino' }),
      ).toBeChecked();
      await expect(viewer(page).locator('canvas')).toHaveAttribute('data-twin-model', 'feminine');
      await expectNoAxeViolations(page);
    });
    test('reduced motion: vistas aplicadas sem transição, sem erro', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/demo/twin');
      await expect(viewer(page)).toHaveAttribute('data-twin-mode', '3d');
      // Varredura do holograma parada (ADR-0028).
      await expect(viewer(page)).toHaveAttribute('data-holo-animated', 'false');
      const body = page.getByRole('region', { name: 'Seu corpo em 3D' });
      await body.getByRole('button', { name: 'Costas' }).click();
      await expect(body.getByRole('button', { name: 'Costas' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(errors).toEqual([]);
    });
  });

  test('sem WebGL: versão 2D com as mesmas regiões e avisos', async ({ page }) => {
    await disableWebGL(page);
    await page.goto('/demo/twin');
    await expect(viewer(page)).toHaveAttribute('data-twin-mode', '2d');
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.getByText(/não exibe 3D aqui/).first()).toBeVisible();
    await page.getByTestId('body-2d').first().locator('[data-region="hip"]').click();
    await expect(
      page
        .getByRole('region', { name: 'Seu corpo em 3D' })
        .getByRole('button', { name: 'Quadril' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expectNoAxeViolations(page);
  });

  test('320px: sem rolagem horizontal e um modelo por vez na comparação', async ({ page }) => {
    await disableWebGL(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/demo/twin');
    await expect(viewer(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    const showing = page.getByRole('group', { name: 'Modelo exibido' });
    await expect(showing.getByRole('button', { name: 'Agora' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await showing.getByRole('button', { name: 'Antes' }).click();
    await expect(page.getByText(/^Antes: /)).toBeVisible();
  });
});

test.describe('conta', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  async function newPerson(page: Page, name: string) {
    const email = e2eEmail(name);
    const userId = await createVerifiedUser(email, E2E_PASSWORD);
    await loginWithOwnIp(page, email);
    return userId;
  }

  test('dados próprios com consentimento: selos INFORMADO, não DEMO', async ({ page }) => {
    const userId = await newPerson(page, 'twin-proprio');
    await seedSyntheticHealthData(userId);
    await disableWebGL(page);
    await page.goto('/twin');
    const body = page.getByRole('region', { name: 'Seu corpo em 3D' });
    await expect(
      body.getByRole('button', { name: 'Origem do dado: Informado' }).first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Origem do dado: Demo' })).toHaveCount(0);
  });

  test('sem registro de medidas: estado "sem dados", sem modelo', async ({ page }) => {
    await newPerson(page, 'twin-vazio');
    await page.goto('/twin');
    await expect(page.getByText('Sem registros neste período')).toBeVisible();
    await expect(page.locator('[data-twin-mode]')).toHaveCount(0);
  });

  test('após revogar os dados de bem-estar, o twin não mostra dados nem modelo', async ({
    page,
  }) => {
    const userId = await newPerson(page, 'twin-revoga');
    await seedSyntheticHealthData(userId);
    await page.goto('/privacidade');
    await page.getByRole('button', { name: 'Revogar: Dados de bem-estar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Revogar agora' }).click();
    await expect(page.getByText(/Revogado: eliminação em/)).toBeVisible();
    await page.goto('/twin');
    await expect(page.getByRole('heading', { name: 'Autorização revogada' })).toBeVisible();
    await expect(page.locator('[data-twin-mode]')).toHaveCount(0);
  });
});
