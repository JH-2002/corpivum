import { existsSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  createVerifiedUser,
  E2E_PASSWORD,
  e2eEmail,
  loginWithOwnIp,
  seedSyntheticHealthData,
  withAdmin,
} from './fixtures';

/**
 * Direitos do titular e exclusão de conta (Fase 6b, ADR-0034; LEG-D04, LEG-D07): pedido com comprovante na
 * tela e o caminho completo exportar → excluir → confirmar eliminação. Dados 100% sintéticos.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
/** Provas e registros de acesso que ficam depois da purga (LEG-R02, LEG-R03). */
const KEPT = new Set(['consent_records', 'policy_acceptances', 'privacy_requests', 'access_logs']);

async function signedIn(browser: Browser, name: string) {
  const email = e2eEmail(name);
  const userId = await createVerifiedUser(email);
  await seedSyntheticHealthData(userId);
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await loginWithOwnIp(page, email);
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
  return { email, userId, page, context };
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`),
  ).toEqual([]);
}

/** Linhas da pessoa em cada tabela com `user_id`, mais a própria conta. */
async function rowCounts(userId: string): Promise<Record<string, number>> {
  return withAdmin(async (db) => {
    const { rows: tables } = await db.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attname = 'user_id' AND NOT a.attisdropped`,
    );
    const out: Record<string, number> = {};
    for (const { relname } of tables) {
      const { rows } = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public."${relname}" WHERE user_id = $1`,
        [userId],
      );
      out[relname] = rows[0]?.n ?? -1;
    }
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM users WHERE id = $1',
      [userId],
    );
    out.users = rows[0]?.n ?? -1;
    return out;
  });
}

test('pedido do titular: comprovante com protocolo e prazo, e o pedido aparece na lista (LEG-D07)', async ({
  browser,
}) => {
  const { page, context } = await signedIn(browser, 'pedido-correcao');
  await page.goto('/privacidade#pedidos');
  const section = page.getByRole('region', { name: 'Seus pedidos', exact: true });
  await section.getByLabel('Correção de dados').check();
  await section.getByRole('button', { name: 'Enviar pedido' }).click();
  const receipt = section.getByTestId('request-receipt');
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText('Protocolo');
  await expect(receipt).toContainText('Resposta até');
  await expectNoAxeViolations(page);
  await page.reload();
  await expect(section.getByText('Correção de dados').first()).toBeVisible();
  await expect(section.getByText(/Aberto · Aberto em/)).toBeVisible();
  await context.close();
});

test('exportar → excluir → confirmar eliminação (LEG-D03, LEG-D04)', async ({ browser }) => {
  const { email, userId, page, context } = await signedIn(browser, 'exclui-conta');
  await page.goto('/privacidade#excluir-conta');
  const section = page.getByRole('region', { name: 'Excluir conta', exact: true });
  await expect(section).toContainText('Antes de excluir, baixe seus dados');

  // 1. Gera e baixa a cópia completa pelo próprio fluxo da exclusão.
  await section.getByRole('button', { name: 'Gerar arquivo' }).click();
  await expect(section.getByText(/Pedido recebido/)).toBeVisible();
  const link = section.getByRole('link', { name: /^Baixar / }).first();
  await expect(async () => {
    // Sem a âncora: navegar só para o mesmo `#` não recarrega a página.
    await page.goto('/privacidade');
    await expect(link).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  const href = (await link.getAttribute('href')) ?? '';
  const res = await page.request.get(href);
  expect(res.status()).toBe(200);
  expect(Object.keys((await res.json()) as object)).toContain('tables');

  // 2. Exclui, com a frase e a senha conferidas no servidor.
  await section.getByRole('button', { name: 'Excluir minha conta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Excluir a conta agora?' });
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);
  await dialog.getByLabel('Senha atual').fill(E2E_PASSWORD);
  await dialog.getByLabel(/Para confirmar, digite/).fill('excluir conta');
  await dialog.getByRole('button', { name: 'Excluir minha conta agora' }).click();
  await expect(dialog.getByText('A frase não confere.', { exact: false }).first()).toBeVisible();
  await dialog.getByLabel('Senha atual').fill('senha errada sintética');
  await dialog.getByLabel(/Para confirmar, digite/).fill('  Excluir minha CONTA ');
  await dialog.getByRole('button', { name: 'Excluir minha conta agora' }).click();
  await expect(dialog.getByText(/Não foi possível confirmar/).first()).toBeVisible();
  await dialog.getByLabel('Senha atual').fill(E2E_PASSWORD);
  await dialog.getByLabel(/Para confirmar, digite/).fill('excluir minha conta');
  await dialog.getByRole('button', { name: 'Excluir minha conta agora' }).click();
  await expect(page).toHaveURL(/\/conta-excluida$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Conta excluída' })).toBeVisible();

  // 3. O acesso acabou: a sessão não vale e o login falha.
  await page.goto('/inicio');
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(/E-mail ou senha incorretos/)).toBeVisible();

  // 4–6. Purga: nada da pessoa fica, além das provas; o arquivo sumiu; o pedido está concluído.
  await expect(async () => {
    expect((await rowCounts(userId)).users).toBe(0);
  }).toPass({ timeout: 30_000 });
  for (const [table, n] of Object.entries(await rowCounts(userId))) {
    if (!KEPT.has(table)) expect(n, table).toBe(0);
  }
  const storageDir = process.env.STORAGE_LOCAL_DIR ?? '.storage';
  expect(existsSync(path.resolve(storageDir, 'exports', userId))).toBe(false);
  // Sem conta nem sessão, o link leva ao login e nunca serve o arquivo.
  const gone = await page.request.get(href, { maxRedirects: 0 });
  expect(gone.status()).not.toBe(200);
  expect(gone.headers()['content-disposition']).toBeUndefined();
  const { rows } = await withAdmin((db) =>
    db.query(`SELECT status::text FROM privacy_requests WHERE user_id = $1 AND kind = 'deletion'`, [
      userId,
    ]),
  );
  expect(rows).toEqual([{ status: 'completed' }]);
  await context.close();
});
