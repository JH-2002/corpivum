import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createVerifiedUser, E2E_PASSWORD, e2eEmail, rowCounts, withAdmin } from './fixtures';

/** Fluxos de conta sem sessão prévia (LEG-S04, LEG-F01). */
test.use({ storageState: { cookies: [], origins: [] } });
// Em sequência dentro do arquivo: o teste do menor compara contagens de linhas do banco.
test.describe.configure({ mode: 'default' });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function login(page: Page, email: string, password = E2E_PASSWORD) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('cabeçalhos de segurança e CSP sem violações (LEG-S05)', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy|Refused to/i.test(msg.text())) violations.push(msg.text());
  });
  const res = await page.goto('/entrar');
  const h = res?.headers() ?? {};
  expect(h['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('no-referrer');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['strict-transport-security']).toContain('max-age=');
  // Produção: `private, no-store` (proxy). O dev server do Next troca por `no-cache, must-revalidate`.
  expect(h['cache-control']).toMatch(/no-store|no-cache/);
  expect(h['x-powered-by']).toBeUndefined();
  await page.getByLabel('E-mail').fill('x@exemplo.test');
  expect(violations).toEqual([]);
});

test('sem sessão, a área logada leva para /entrar', async ({ page }) => {
  await page.goto('/inicio');
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible();
});

test('cookie de sessão inventado não dá acesso', async ({ page }) => {
  await page.setExtraHTTPHeaders({ Cookie: `__Host-hm_session=${'A'.repeat(43)}` });
  await page.goto('/inicio');
  await expect(page).toHaveURL(/\/entrar$/);
});

test('cadastro adulto: idade → conta → confira o e-mail → login após verificação', async ({
  page,
}) => {
  const email = e2eEmail('cadastro');
  await page.goto('/cadastro');
  await page.getByLabel('Data de nascimento').fill('1990-05-20');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/\/cadastro\/conta$/);

  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel('Confirme a senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();

  // Sem verificar o e-mail, o login leva à tela de verificação pendente.
  await login(page, email);
  await expect(
    page.getByRole('heading', { name: 'Confirme seu e-mail para continuar' }),
  ).toBeVisible();

  // Simula o clique no link (o token só existe no e-mail; aqui marcamos direto no banco).
  await withAdmin((db) =>
    db.query('UPDATE users SET email_verified_at = now() WHERE email = $1', [email]),
  );
  await page.goto('/inicio');
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
});

test('menor de 18: mensagem neutra e nenhuma linha nova no banco (LEG-F01)', async ({ page }) => {
  const before = await rowCounts();
  await page.goto('/cadastro');
  await page.getByLabel('Data de nascimento').fill('2012-01-01');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Não é possível criar uma conta' })).toBeVisible();
  expect(await rowCounts()).toEqual(before);

  // Nova tentativa imediata volta para a mesma mensagem (cookie sem identificador).
  await page.goto('/cadastro');
  await expect(page).toHaveURL(/\/cadastro\/indisponivel$/);
  // Passo 2 também não abre sem o cookie de adulto.
  await page.goto('/cadastro/conta');
  await expect(page).toHaveURL(/\/cadastro\/indisponivel$/);

  const cookies = await page.context().cookies();
  const block = cookies.find((c) => c.name === 'hm_age_block');
  expect(block?.value).toBe('1');
  expect(block?.expires).toBe(-1); // cookie de sessão do navegador
});

test('login com senha errada e com e-mail inexistente mostram a mesma mensagem', async ({
  page,
}) => {
  const email = e2eEmail('enum');
  await createVerifiedUser(email);
  await login(page, email, 'senha errada sintética');
  const wrong = await page.locator('form [role="alert"]').innerText();
  await login(page, e2eEmail('nao-existe'), 'senha errada sintética');
  const missing = await page.locator('form [role="alert"]').innerText();
  expect(missing).toBe(wrong);
});

test('encerrar a sessão em outro aparelho derruba o acesso na próxima requisição', async ({
  browser,
}) => {
  const email = e2eEmail('revoga');
  await createVerifiedUser(email);

  const laptop = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const phone = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    userAgent:
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
  });
  const a = await laptop.newPage();
  const b = await phone.newPage();
  await login(a, email);
  await login(b, email);
  await expect(b.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();

  await a.goto('/configuracoes/seguranca');
  await a.getByRole('button', { name: 'Encerrar sessão Chrome · Android' }).click();
  await expect(a.getByRole('button', { name: /Chrome · Android/ })).toHaveCount(0);

  await b.goto('/sono');
  await expect(b).toHaveURL(/\/entrar$/);
  await laptop.close();
  await phone.close();
});

test.describe('acessibilidade das telas de conta (axe)', () => {
  for (const path of ['/entrar', '/cadastro', '/recuperar-senha', '/redefinir-senha']) {
    test(`${path} sem violações`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }

  test('erros de login são anunciados e recebem foco', async ({ page }) => {
    await login(page, e2eEmail('a11y'), 'senha errada sintética');
    const alert = page.locator('form [role="alert"]');
    await expect(alert).toBeFocused();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
