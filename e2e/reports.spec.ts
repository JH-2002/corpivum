import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  createVerifiedUser,
  e2eEmail,
  loginWithOwnIp,
  seedSyntheticHealthData,
  withAdmin,
} from './fixtures';

/**
 * Relatórios e exportação (§29, LEG-D03, ADR-0032): gerar, baixar pelo link autenticado, isolamento entre
 * pessoas, vencimento do link e ausência de valores só internos (IMC, LEG-M06). Contas próprias por teste
 * (o limite de arquivos por dia não interfere nos outros specs). Dados 100% sintéticos.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function signedIn(browser: Browser, name: string, seed = true) {
  const email = e2eEmail(name);
  const userId = await createVerifiedUser(email);
  if (seed) await seedSyntheticHealthData(userId);
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  // IP próprio por login: a suíte inteira não esbarra no limite de tentativas por IP.
  await loginWithOwnIp(page, email);
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
  return { userId, page, context };
}

/** Recarrega até o arquivo ficar pronto e devolve o endereço do download. */
async function readyLink(page: Page, path: string): Promise<string> {
  const link = page.getByRole('link', { name: /^Baixar / }).first();
  await expect(async () => {
    await page.goto(path);
    await expect(link).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  return (await link.getAttribute('href')) ?? '';
}

test('relatório na tela: rodapé fixo, sem IMC e acessível', async ({ browser }) => {
  const { page, context } = await signedIn(browser, 'relatorio-tela');
  await page.goto('/relatorios?tipo=month');
  await expect(page.getByRole('heading', { level: 2, name: 'Relatório mensal' })).toBeVisible();
  await expect(
    page.getByText('Material de autoacompanhamento, não é laudo nem avaliação clínica.'),
  ).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/\bIMC\b/);
  await page.goto('/corpo');
  await expect(page.locator('main')).not.toContainText(/\bIMC\b/);
  await page.goto('/relatorios?tipo=year');
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
  await context.close();
});

test('exportação completa: link autenticado, só do dono, expira (LEG-D03)', async ({ browser }) => {
  const a = await signedIn(browser, 'exporta-a');
  await a.page.goto('/privacidade#seus-dados');
  const section = a.page.getByRole('region', { name: 'Seus dados', exact: true });
  await expect(section).toContainText('Peso e medidas');
  await section.getByRole('button', { name: 'Gerar arquivo' }).click();
  await expect(section.getByText(/Pedido recebido/)).toBeVisible();

  const href = await readyLink(a.page, '/privacidade');
  expect(href).toMatch(/^\/privacidade\/exportacoes\/[0-9a-f-]{36}$/);
  const res = await a.page.request.get(href);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-disposition']).toMatch(/^attachment; filename="healthmind360-/);
  expect(res.headers()['cache-control']).toContain('no-store');
  const text = await res.text();
  const doc = JSON.parse(text) as { schemaVersion: number; tables: Record<string, unknown> };
  expect(doc.schemaVersion).toBe(1);
  expect(Object.keys(doc.tables)).toContain('body_measurements');
  expect(text).not.toMatch(/"(bmi|imc|waistHipRatio)"/i);

  // Outra pessoa, mesmo logada, não baixa; sem sessão, nada é servido.
  const b = await signedIn(browser, 'exporta-b', false);
  expect((await b.page.request.get(href)).status()).toBe(404);
  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const anonRes = await anon.request.get(href, { maxRedirects: 0 });
  expect(anonRes.status()).not.toBe(200);
  await anon.close();

  // Link vencido não baixa mais.
  await withAdmin((db) =>
    db.query(
      `UPDATE data_export_jobs SET expires_at = now() - interval '1 second', updated_at = now()
        WHERE user_id = $1`,
      [a.userId],
    ),
  );
  expect((await a.page.request.get(href)).status()).toBe(404);
  await a.context.close();
  await b.context.close();
});

test('relatório em PDF pelo link autenticado', async ({ browser }) => {
  const { page, context } = await signedIn(browser, 'relatorio-pdf');
  await page.goto('/relatorios?tipo=month');
  const form = page.getByRole('region', { name: 'Gerar arquivo' });
  await form.getByRole('button', { name: 'Gerar arquivo' }).click();
  await expect(form.getByText(/Pedido recebido/)).toBeVisible();
  const href = await readyLink(page, '/relatorios?tipo=month');
  const res = await page.request.get(href);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/pdf');
  expect((await res.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  await context.close();
});

test('OI-32: depois de revogar, as telas ficam vazias e a cópia completa continua disponível', async ({
  browser,
}) => {
  const { userId, page, context } = await signedIn(browser, 'carencia');
  await page.goto('/privacidade');
  await page.getByRole('button', { name: 'Revogar: Dados de bem-estar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Revogar o uso dos dados de bem-estar?' });
  await expect(dialog.getByText(/até a eliminação/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Revogar agora' }).click();
  await expect(page.getByText(/Revogado: eliminação em/)).toBeVisible();

  // Nada é exibido nem processado: telas, relatório, gráficos e twin mostram só o aviso de autorização.
  for (const path of ['/sono', '/corpo', '/relatorios', '/twin', '/timeline']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Autorização revogada' })).toBeVisible();
    await expect(page.locator('.recharts-wrapper')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/\d+(,\d+)? kg/);
  }

  // A cópia completa é o único uso permitido até a eliminação.
  await page.goto('/privacidade#seus-dados');
  const section = page.getByRole('region', { name: 'Seus dados', exact: true });
  await expect(section).toContainText(/até a eliminação, em .+, você ainda pode baixar/i);
  await section.getByRole('button', { name: 'Gerar arquivo' }).click();
  await expect(section.getByText(/Pedido recebido/)).toBeVisible();
  const href = await readyLink(page, '/privacidade');
  const res = await page.request.get(href);
  expect(res.status()).toBe(200);
  const doc = JSON.parse(await res.text()) as {
    tables: Record<string, { records: unknown[] }>;
  };
  expect(doc.tables.sleep?.records.length).toBeGreaterThan(0);
  expect(doc.tables.body_measurements?.records.length).toBeGreaterThan(0);

  const { rows } = await withAdmin((db) =>
    db.query<{ action: string }>(
      `SELECT action::text FROM audit_logs WHERE subject_user_id = $1 AND resource_type = 'data_export'`,
      [userId],
    ),
  );
  expect(rows.map((r) => r.action)).toEqual(
    expect.arrayContaining([
      'data_export_requested',
      'data_export_health_read',
      'data_export_downloaded',
    ]),
  );
  await context.close();
});
