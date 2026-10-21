import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { PRODUCT_NAME } from '../../src/config/product';
import { BODY_ASSETS } from '../../src/modules/twin/bodyAssets';
import { DEMO_ROUTES, PAGES } from '../routes';

/**
 * Modo só demo (ADR-0043), contra o build de produção sem banco nem credenciais (playwright.demo.config.ts):
 * só /demo existe; páginas do app completo redirecionam (D3), route handlers e actions do app completo dão
 * 404, nenhum cookie além das preferências, nada de terceiros, headers e CSP de produção, .glb do twin.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const ORIGIN = 'http://localhost:3200';
const TOUR_SEEN = {
  cookies: [],
  origins: [{ origin: ORIGIN, localStorage: [{ name: 'hm_tour_demo_seen', value: '1' }] }],
};
/** Cookies de preferência da demo: de sessão, sem identificador (ADR-0021, ADR-0035). */
const PREFERENCE_COOKIES = ['__Host-hm_period', '__Host-hm_presenting', '__Host-hm_privacy'];
const BANNER = 'Demonstração com dados fictícios. O app ainda não está aberto ao público.';

const FULL_APP_PAGES = PAGES.map((p) => p.path).filter(
  (p) => p !== '/demo' && !p.startsWith('/demo/'),
);

function expectSecurityHeaders(headers: Record<string, string>) {
  expect(headers['content-security-policy']).toMatch(/default-src 'self'/);
  expect(headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);
  expect(headers['strict-transport-security']).toContain('max-age=63072000');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
}

/** IDs das server actions referenciadas pelos scripts da página, pelo nome exportado. */
async function actionIds(request: APIRequestContext, path: string): Promise<Map<string, string>> {
  const html = await (await request.get(path)).text();
  const scripts = [...new Set(html.match(/\/_next\/static\/[^"]+\.js/g) ?? [])];
  const ids = new Map<string, string>();
  for (const src of scripts) {
    const js = await (await request.get(src)).text();
    for (const m of js.matchAll(/createServerReference\)?\("([0-9a-f]{20,})"[^)]*?"(\w+)"\)/g)) {
      if (m[1] && m[2]) ids.set(m[2], m[1]);
    }
  }
  return ids;
}

function callAction(request: APIRequestContext, path: string, id: string, args: unknown[]) {
  return request.post(path, {
    headers: { 'next-action': id, 'content-type': 'text/plain;charset=UTF-8', origin: ORIGIN },
    data: JSON.stringify(args),
    maxRedirects: 0,
  });
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`),
  ).toEqual([]);
}

test.describe('rotas do app completo', () => {
  test('toda página fora de /demo redireciona para /demo, com CSP e no-store', async ({
    request,
  }) => {
    expect(FULL_APP_PAGES.length).toBeGreaterThan(20);
    for (const path of [...FULL_APP_PAGES, '/legal/termos', '/nao-existe']) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(new URL(res.headers()['location'] ?? '', ORIGIN).pathname, path).toBe('/demo');
      expect(res.headers()['cache-control'], path).toBe('private, no-store');
      expectSecurityHeaders(res.headers());
    }
  });

  test('route handlers e qualquer outro método fora de /demo dão 404', async ({ request }) => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect(
      (await request.get(`/privacidade/exportacoes/${id}`, { maxRedirects: 0 })).status(),
    ).toBe(404);
    expect((await request.get('/api/qualquer', { maxRedirects: 0 })).status()).toBe(404);
    expect((await request.post('/entrar', { data: 'x', maxRedirects: 0 })).status()).toBe(404);
    expect((await request.delete('/privacidade', { maxRedirects: 0 })).status()).toBe(404);
  });
});

test.describe('server actions', () => {
  test('as do app completo dão 404 mesmo chamadas em /demo com o ID real; as da demo funcionam', async ({
    request,
  }) => {
    const ids = await actionIds(request, '/demo');
    // O Header da demo importa `logoutAction`: o ID dela está no bundle público.
    const logout = ids.get('logoutAction');
    const period = ids.get('setPeriodAction');
    expect(logout).toBeDefined();
    expect(period).toBeDefined();

    const blocked = await callAction(request, '/demo', logout ?? '', []);
    expect(blocked.status()).toBe(404);
    expect(await blocked.text()).toContain('NEXT_HTTP_ERROR_FALLBACK;404');
    // Fora de /demo o proxy recusa antes de chegar ao Next.
    expect((await callAction(request, '/entrar', logout ?? '', [])).status()).toBe(404);

    const fullApp = [...ids.entries()].filter(
      ([name]) =>
        ![
          'setPeriodAction',
          'setPrivacyModeAction',
          'enterPresentationAction',
          'exitPresentationAction',
        ].includes(name),
    );
    expect(fullApp.length).toBeGreaterThan(0);
    for (const [name, id] of fullApp) {
      expect((await callAction(request, '/demo', id, [])).status(), name).toBe(404);
    }

    const ok = await callAction(request, '/demo', period ?? '', [
      JSON.stringify({ preset: '30d' }),
    ]);
    expect(ok.status()).toBe(200);
  });
});

test.describe('a demonstração', () => {
  test.use({ storageState: TOUR_SEEN });

  test('primeira visita não cria cookie; nada sai da origem; headers de produção', async ({
    page,
  }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      if (new URL(req.url()).origin !== ORIGIN) external.push(req.url());
    });
    const res = await page.goto('/demo');
    expect(res?.status()).toBe(200);
    expect(res?.headers()['set-cookie']).toBeUndefined();
    expectSecurityHeaders(res?.headers() ?? {});
    for (const route of DEMO_ROUTES) {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1, name: route.title })).toBeVisible();
    }
    await page.waitForLoadState('networkidle');
    expect(await page.context().cookies()).toEqual([]);
    expect(external).toEqual([]);
  });

  test('preferências usam só os cookies de sessão da demo', async ({ page }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Modo privacidade', exact: true }).first().click();
    await expect.poll(async () => (await page.context().cookies()).length).toBeGreaterThan(0);
    for (const cookie of await page.context().cookies()) {
      expect(PREFERENCE_COOKIES).toContain(cookie.name);
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.secure).toBe(true);
      expect(cookie.expires).toBe(-1);
    }
  });

  test('sem cadastro nem links para o app completo; o aviso da demo no lugar', async ({ page }) => {
    for (const route of DEMO_ROUTES) {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1, name: route.title })).toBeVisible();
      await expect(page.getByRole('link', { name: /Criar conta|Começar com meus/ })).toHaveCount(0);
      await expect(page.getByText(/crie uma conta/)).toHaveCount(0);
      const hrefs = await page
        .locator('a[href]')
        .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
      const outside = hrefs.filter((h) => h.startsWith('/') && !/^\/demo(\/|\?|#|$)/.test(h));
      expect(outside, route.path).toEqual([]);
    }
    await page.goto('/demo');
    await page.getByRole('link', { name: 'Sobre esta demonstração' }).first().click();
    await expect(page).toHaveURL(/\/demo\/sobre$/);
  });

  test('faixa fixa e nome do produto em toda tela, inclusive na apresentação (ADR-0044)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const banner = page.getByRole('note').filter({ hasText: BANNER });
    for (const path of [...DEMO_ROUTES.map((r) => r.path), '/demo/sobre', '/demo/apresentacao']) {
      await page.goto(path);
      await expect(banner, path).toHaveCount(1);
      await expect(page, path).toHaveTitle(new RegExp(`${PRODUCT_NAME}$`));
      // O HTML inteiro, com o payload do React: nem nome antigo nem os rascunhos jurídicos do app completo.
      const html = await page.content();
      expect(html, path).not.toContain('HealthMind');
      expect(html, path).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
    // A faixa não sai da tela ao rolar.
    await page.goto('/demo/sono');
    await page.mouse.wheel(0, 3000);
    await expect(banner).toBeInViewport();
    await page.goto('/demo/apresentacao');
    await page.getByRole('button', { name: 'Começar apresentação' }).click();
    await expect(page.getByRole('button', { name: 'Sair da apresentação' })).toBeVisible();
    await expect(banner).toHaveCount(1);
    await page.mouse.wheel(0, 3000);
    await expect(banner).toBeInViewport();
  });

  test('o aviso da demonstração: rascunho, responsável e contato, acessível', async ({ page }) => {
    await page.goto('/demo/sobre');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sobre esta demonstração' }),
    ).toBeVisible();
    await expect(page.getByText('RASCUNHO — revisão jurídica obrigatória.')).toBeVisible();
    await expect(page.getByText(/João Henrique Arruda do Carmo/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'joao2002carmo@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:joao2002carmo@gmail.com',
    );
    await expectNoAxeViolations(page);
  });

  test('o twin carrega o .glb com cache imutável e sem passar pelo proxy', async ({
    page,
    request,
  }) => {
    for (const asset of Object.values(BODY_ASSETS)) {
      const res = await request.get(asset.file, { maxRedirects: 0 });
      expect(res.status(), asset.file).toBe(200);
      expect(res.headers()['cache-control']).toContain('immutable');
      expect(res.headers()['content-security-policy']).toBeUndefined();
      expect((await res.body()).byteLength).toBe(asset.bytes);
    }
    await page.goto('/demo/twin');
    await page
      .getByRole('region', { name: 'Qual modelo você prefere ver?' })
      .getByRole('button', { name: 'Feminino' })
      .click();
    await expect(page.locator('[data-twin-mode] canvas').first()).toHaveAttribute(
      'data-twin-model',
      'feminine',
      { timeout: 25_000 },
    );
  });
});
