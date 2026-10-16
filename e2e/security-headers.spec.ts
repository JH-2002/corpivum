import { expect, test, type APIResponse, type Response } from '@playwright/test';

/**
 * TM-02 (ADR-0037): cabeçalhos de segurança e `Cache-Control` em toda classe de resposta — página pública,
 * autenticada, 404, redirecionamentos (proxy e rotas removidas), download (route handler), prefetch (P7-N1) e
 * resposta de server action. TM-01: o token do link sai do endereço ao abrir a página.
 * No CI roda contra o build de produção: `private` com `no-store` (o proxy manda `private, no-store`; 404 e
 * server actions saem com a forma mais restritiva do Next, `private, no-cache, no-store, max-age=0,
 * must-revalidate`). O dev server troca por `no-cache`.
 */
const NO_STORE = process.env.CI ? /^private,.*\bno-store\b/ : /no-store|no-cache/;

function expectSecurityHeaders(res: Response | APIResponse | null) {
  const h = res?.headers() ?? {};
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['content-security-policy']).toContain("default-src 'self'");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['referrer-policy']).toBe('no-referrer');
  expect(h['strict-transport-security']).toContain('max-age=');
  expect(h['permissions-policy']).toContain('camera=()');
  expect(h['cross-origin-opener-policy']).toBe('same-origin');
  expect(h['x-powered-by']).toBeUndefined();
}

test.describe('sem sessão', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('página pública e demo', async ({ page }) => {
    for (const path of ['/entrar', '/demo', '/legal/politica-de-privacidade']) {
      const res = await page.goto(path);
      expectSecurityHeaders(res);
      expect(res?.headers()['cache-control']).toMatch(NO_STORE);
    }
  });

  test('redirecionamentos: área logada sem sessão e rota removida', async ({ request }) => {
    for (const [path, to] of [
      ['/inicio', '/entrar'],
      ['/humor', '/inicio'],
    ] as const) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(new URL(res.headers()['location'] ?? '', 'http://x').pathname).toBe(to);
      expectSecurityHeaders(res);
      expect(res.headers()['cache-control']).toMatch(NO_STORE);
    }
  });

  test('404', async ({ request }) => {
    const res = await request.get('/legal/nao-existe-mesmo');
    expect(res.status()).toBe(404);
    expectSecurityHeaders(res);
    expect(res.headers()['cache-control']).toMatch(NO_STORE);
  });

  test('prefetch passa pelo proxy (P7-N1)', async ({ request }) => {
    const res = await request.get('/demo', {
      headers: { rsc: '1', 'next-router-prefetch': '1' },
      maxRedirects: 0,
    });
    expectSecurityHeaders(res);
    expect(res.headers()['cache-control']).toMatch(NO_STORE);
  });

  test('token do link no fragmento sai do endereço ao abrir (TM-01)', async ({ page }) => {
    const token = 'A'.repeat(43);
    await page.goto(`/redefinir-senha#token=${token}`);
    await expect(page.getByLabel('Nova senha')).toBeVisible();
    await expect.poll(() => page.url()).toMatch(/\/redefinir-senha$/);
    await page.goto(`/verificar-email?token=${token}`);
    await expect(page.getByRole('button', { name: /confirmar/i })).toBeVisible();
    await expect.poll(() => page.url()).toMatch(/\/verificar-email$/);
  });
});

test.describe('com sessão', () => {
  test('página autenticada', async ({ page }) => {
    const res = await page.goto('/inicio');
    expect(res?.status()).toBe(200);
    expectSecurityHeaders(res);
    expect(res?.headers()['cache-control']).toMatch(NO_STORE);
  });

  test('download inexistente (route handler)', async ({ page }) => {
    await page.goto('/inicio');
    const res = await page.request.get(
      '/privacidade/exportacoes/00000000-0000-4000-8000-000000000000',
    );
    expect(res.status()).toBe(404);
    expectSecurityHeaders(res);
    expect(res.headers()['cache-control']).toBe('private, no-store');
  });

  test('resposta de server action', async ({ page }) => {
    await page.goto('/inicio');
    const action = page.waitForResponse(
      (r) => r.request().method() === 'POST' && Boolean(r.request().headers()['next-action']),
    );
    await page.getByRole('button', { name: 'Modo privacidade', exact: true }).click();
    const res = await action;
    expectSecurityHeaders(res);
    expect(res.headers()['cache-control']).toMatch(NO_STORE);
  });
});
