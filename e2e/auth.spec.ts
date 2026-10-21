import { PRODUCT_NAME } from '../src/config/product';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  createVerifiedUser,
  E2E_PASSWORD,
  e2eEmail,
  foreignRowsSince,
  withAdmin,
} from './fixtures';

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

test('cadastro adulto: boas-vindas → idade → conta → e-mail → onboarding (§52)', async ({
  page,
}) => {
  const email = e2eEmail('cadastro');
  await page.goto('/cadastro');
  // §52 passo 1: o que o app faz e o que não faz.
  await expect(
    page.getByRole('heading', { level: 1, name: `Boas-vindas ao ${PRODUCT_NAME}` }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'O que o app não faz' })).toBeVisible();
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
  // Área logada sem onboarding: vai para a oferta de MFA (opcional) e depois para as escolhas.
  await page.goto('/inicio');
  await expect(page).toHaveURL(/\/boas-vindas\/seguranca$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Proteja sua conta' })).toBeVisible();
  await page.getByRole('link', { name: 'Continuar' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Suas escolhas de privacidade' }),
  ).toBeVisible();

  // LEG-C02: nenhuma caixa vem marcada (Termos, Política e dados de bem-estar; ADR-0042).
  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(3);
  for (const box of await boxes.all()) await expect(box).not.toBeChecked();

  // Sem aceitar os Termos não avança.
  await page.getByRole('button', { name: 'Salvar escolhas e continuar' }).click();
  await expect(
    page.getByText('Para usar o app, é preciso aceitar os Termos de Uso.').first(),
  ).toBeVisible();

  // LEG-C05: recusar todas as finalidades opcionais não bloqueia o app.
  await page.getByLabel('Li e aceito os Termos de Uso.').check();
  await page.getByLabel('Li a Política de Privacidade.').check();
  await page.getByRole('button', { name: 'Salvar escolhas e continuar' }).click();
  // §52.5 (Fase 2): demonstração ou começar do zero.
  await expect(page).toHaveURL(/\/boas-vindas\/dados$/);
  await page.getByRole('button', { name: 'Começar com meus dados' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Registro de bem-estar desativado' }),
  ).toBeVisible();

  const { rows } = await withAdmin((db) =>
    db.query(
      `SELECT (SELECT count(*) FROM consent_records c JOIN users u ON u.id = c.user_id
                WHERE u.email = $1)::int AS consents,
              (SELECT count(*) FROM policy_acceptances a JOIN users u ON u.id = a.user_id
                WHERE u.email = $1)::int AS accepted`,
      [email],
    ),
  );
  expect(rows[0]).toEqual({ consents: 0, accepted: 2 });
});

test('menor de 18: mensagem neutra e nenhuma linha nova no banco (LEG-F01)', async ({ page }) => {
  const start = new Date(Date.now() - 1000);
  await page.goto('/cadastro');
  await page.getByLabel('Data de nascimento').fill('2012-01-01');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Não é possível criar uma conta' })).toBeVisible();
  // Nenhuma linha nova fora das contas do e2e (outros testes escrevem em paralelo nas próprias contas).
  const written = await foreignRowsSince(start);
  expect(Object.entries(written).filter(([, n]) => n !== 0)).toEqual([]);

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

test('revogada, a sessão cai também na navegação pelo cliente (sem recarregar)', async ({
  browser,
}) => {
  const email = e2eEmail('softnav');
  await createVerifiedUser(email);
  const ctxA = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const ctxB = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await login(a, email);
  await login(b, email);
  await expect(b.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();

  await a.goto('/configuracoes/seguranca');
  await a.getByRole('button', { name: 'Encerrar todas as outras' }).click();
  await expect(a.getByText('Nenhuma outra sessão ativa.')).toBeVisible();

  // Navegação pelo cliente (clique num link do menu): nada de recarregar a página.
  await b
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Sono' })
    .click();
  await expect(b).toHaveURL(/\/entrar$/);
  await ctxA.close();
  await ctxB.close();
});

test.describe('acessibilidade das telas de conta (axe)', () => {
  // As telas de conta em si estão no a11y.spec.ts (inventário de todas as páginas, claro e escuro, 7d).
  test('erros de login são anunciados e recebem foco', async ({ page }) => {
    await login(page, e2eEmail('a11y'), 'senha errada sintética');
    const alert = page.locator('form [role="alert"]');
    await expect(alert).toBeFocused();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
