import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createVerifiedUser, E2E_PASSWORD, e2eEmail, withAdmin } from './fixtures';

/**
 * Termos v2 e Política v2 não substanciais (ADR-0031, ADR-0041): quem aceitou a v1 segue usando o app, vê um
 * aviso único e registra a ciência em "Entendi". Conta nova não vê aviso.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const NOTICE = { name: 'Atualizamos um documento' } as const;

async function login(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
}

test('quem aceitou os Termos v1 vê o aviso uma vez e registra a ciência', async ({ page }) => {
  const email = e2eEmail('termos-v1');
  const userId = await createVerifiedUser(email);
  await withAdmin((db) =>
    db.query(
      `UPDATE policy_acceptances a SET policy_version_id = v1.id
         FROM policy_versions v1, policy_versions cur
        WHERE a.user_id = $1 AND a.policy_version_id = cur.id AND cur.document = 'terms'
          AND v1.document = 'terms' AND v1.version = 1`,
      [userId],
    ),
  );
  await login(page, email);

  const notice = page.getByRole('region', NOTICE);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Sugestões do app');
  await expect(notice.getByRole('link', { name: 'Ler os Termos de Uso' })).toHaveAttribute(
    'href',
    '/legal/termos',
  );
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  await notice.getByRole('button', { name: 'Entendi' }).click();
  await expect(page.getByRole('region', NOTICE)).toHaveCount(0);
  await page.goto('/sono');
  await expect(page.getByRole('region', NOTICE)).toHaveCount(0);

  const kinds = await withAdmin((db) =>
    db.query<{ kind: string }>(
      `SELECT a.kind::text AS kind FROM policy_acceptances a
         JOIN policy_versions v ON v.id = a.policy_version_id
        WHERE a.user_id = $1 AND v.document = 'terms' ORDER BY v.version`,
      [userId],
    ),
  );
  expect(kinds.rows.map((r) => r.kind)).toEqual(['accepted', 'acknowledged']);
});

test('conta nova não vê o aviso e os Termos públicos mostram a v2 sem "Sugestões do app"', async ({
  page,
}) => {
  const email = e2eEmail('termos-v2');
  await createVerifiedUser(email);
  await login(page, email);
  await expect(page.getByRole('region', NOTICE)).toHaveCount(0);

  await page.goto('/legal/termos');
  await expect(page.getByText(/Versão 2/)).toBeVisible();
  await expect(page.getByText('Sugestões do app')).toHaveCount(0);
});

test('quem aceitou as duas v1 vê um só aviso com Termos e Política e registra as duas ciências', async ({
  page,
}) => {
  const email = e2eEmail('politica-v1');
  const userId = await createVerifiedUser(email);
  await withAdmin((db) =>
    db.query(
      `UPDATE policy_acceptances a SET policy_version_id = v1.id
         FROM policy_versions v1, policy_versions cur
        WHERE a.user_id = $1 AND a.policy_version_id = cur.id
          AND cur.document IN ('terms', 'privacy_policy')
          AND v1.document = cur.document AND v1.version = 1`,
      [userId],
    ),
  );
  await login(page, email);

  const notices = { name: 'Atualizamos documentos' } as const;
  const notice = page.getByRole('region', notices);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('30 dias');
  await expect(
    notice.getByRole('link', { name: 'Ler a Política de Privacidade' }),
  ).toHaveAttribute('href', '/legal/politica-de-privacidade');
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  await notice.getByRole('button', { name: 'Entendi' }).click();
  await expect(page.getByRole('region', notices)).toHaveCount(0);

  const kinds = await withAdmin((db) =>
    db.query<{ document: string; kind: string }>(
      `SELECT v.document::text AS document, a.kind::text AS kind FROM policy_acceptances a
         JOIN policy_versions v ON v.id = a.policy_version_id
        WHERE a.user_id = $1 AND v.version = 2 ORDER BY v.document`,
      [userId],
    ),
  );
  expect(kinds.rows).toEqual([
    { document: 'privacy_policy', kind: 'acknowledged' },
    { document: 'terms', kind: 'acknowledged' },
  ]);
});

test('a Política pública mostra a v2 com o prazo das contas sem onboarding e os cookies', async ({
  page,
}) => {
  await page.goto('/legal/politica-de-privacidade');
  await expect(page.getByText(/Versão 2/)).toBeVisible();
  await expect(page.getByText(/30 dias após o cadastro/)).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Cookies e armazenamento no navegador' }),
  ).toBeVisible();
});
