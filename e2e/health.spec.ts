import { PRODUCT_NAME } from '../src/config/product';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  createVerifiedUser,
  E2E_PASSWORD,
  e2eEmail,
  loginWithOwnIp,
  seedSyntheticHealthData,
  withAdmin,
} from './fixtures';
import { choosePeriod, expectPeriod } from './period';
import { chooseOption } from './choice';
import { settled } from './settle';

/**
 * Fase 2 (ADR-0021): passo 5 do onboarding (§52.5), registros de sono, hábitos e corpo
 * (criar, editar, excluir), dashboard com período global, pedido de revisão do Índice (LEG-D08) e
 * bloqueio após revogar (LEG-C04). Cada teste usa uma pessoa sintética própria.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page: await settled(page) }).withTags(WCAG_TAGS).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`),
  ).toEqual([]);
}

async function newPerson(page: Page, name: string, options = {}) {
  const email = e2eEmail(name);
  const userId = await createVerifiedUser(email, E2E_PASSWORD, options);
  await loginWithOwnIp(page, email);
  return { email, userId };
}

test('passo 5: demonstração sem gravar nada e depois "começar com meus dados"', async ({
  page,
}) => {
  const { userId } = await newPerson(page, 'passo5', { dataMode: null });
  await expect(page).toHaveURL(/\/boas-vindas\/dados$/);
  await expect(page.getByText('Etapa 3 de 3')).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole('button', { name: 'Ver a demonstração' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
  await expect(page.getByText('Você está vendo dados de demonstração')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Índice de Bem-Estar' })).toBeVisible();
  await expectNoAxeViolations(page);

  // Nada fictício foi gravado na conta.
  const count = async () =>
    withAdmin((db) =>
      db.query<{ n: number }>(
        `SELECT (SELECT count(*) FROM sleep_entries WHERE user_id = $1)
              + (SELECT count(*) FROM habits WHERE user_id = $1)
              + (SELECT count(*) FROM body_measurements WHERE user_id = $1) AS n`,
        [userId],
      ),
    ).then((r) => Number(r.rows[0]?.n));
  expect(await count()).toBe(0);

  await page.getByRole('button', { name: 'Começar com meus dados' }).click();
  const dialog = page.getByRole('dialog', { name: 'Começar com os seus dados?' });
  await dialog.getByRole('button', { name: 'Começar com meus dados' }).click();
  await expect(page.getByRole('heading', { name: `Boas-vindas ao ${PRODUCT_NAME}` })).toBeVisible();
  await expect(page.getByText('Você está vendo dados de demonstração')).toHaveCount(0);
});

test('passo 5: "começar do zero" leva ao estado vazio acolhedor, sem gráfico', async ({ page }) => {
  await newPerson(page, 'zero', { dataMode: null });
  await page.getByRole('button', { name: 'Começar com meus dados' }).click();
  await expect(page.getByRole('heading', { name: `Boas-vindas ao ${PRODUCT_NAME}` })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('.recharts-wrapper')).toHaveCount(0);
});

test('sono: registrar, editar e excluir', async ({ page }) => {
  await newPerson(page, 'sono');
  await page.goto('/sono');
  await page.getByLabel('Deitei em').fill('2026-10-01T23:15');
  await page.getByLabel('Acordei em').fill('2026-10-02T07:05');
  await chooseOption(page, 'Qualidade do sono (opcional)', '4');
  await page.getByLabel('Nota (opcional)').fill('Nota sintética do teste.');
  await page.getByRole('button', { name: 'Salvar registro' }).click();
  await expect(page.getByRole('status').getByText('Registro salvo.')).toBeVisible();

  // O período padrão (30 dias) pode não incluir a data: usa um intervalo personalizado.
  await choosePeriod(page, 'Personalizado');
  await page.getByLabel('De', { exact: true }).fill('2026-09-01');
  await page.getByLabel('Até', { exact: true }).fill('2026-10-05');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText('Deitou às 23:15, acordou às 07:05 (7 h 50 min)')).toBeVisible();
  await expect(page.locator('li p').filter({ hasText: 'Nota sintética do teste.' })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByText('Editar', { exact: true }).click();
  const edit = page.locator('details[open]');
  await edit.getByLabel('Acordei em').fill('2026-10-02T07:35');
  await edit.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Deitou às 23:15, acordou às 07:35 (8 h 20 min)')).toBeVisible();

  await page.getByRole('button', { name: /^Excluir registro:/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir registro' }).click();
  await expect(page.getByText(/acordou às 07:35/)).toHaveCount(0);
});

test('hábitos: criar, marcar no dashboard e ocultar sequências', async ({ page }) => {
  await newPerson(page, 'habitos');
  await page.goto('/habitos');
  await page.getByLabel('Nome do hábito').fill('Beber água ao acordar');
  await page.getByRole('button', { name: 'Criar hábito' }).click();
  await expect(page.getByRole('heading', { name: 'Beber água ao acordar' })).toBeVisible();

  await page.goto('/inicio');
  await page
    .getByRole('button', { name: 'Marcar como feito: "Beber água ao acordar", hoje' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Feito: "Beber água ao acordar", hoje (desmarcar)' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 dia seguido')).toBeVisible();

  await page.goto('/habitos');
  await page.getByRole('button', { name: 'Ocultar sequências' }).click();
  await expect(page.getByText('As sequências (dias seguidos) estão ocultas.')).toBeVisible();
  await expect(page.getByText(/dia seguido/)).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test('corpo: medição com vírgula decimal, sem IMC na tela (LEG-M06, ADR-0032)', async ({
  page,
}) => {
  await newPerson(page, 'corpo');
  await page.goto('/corpo');
  await page.getByLabel('Peso, em quilogramas').fill('70,5');
  await page.getByLabel('Altura, em centímetros').fill('172');
  await page.getByRole('button', { name: 'Salvar medição' }).click();
  await expect(page.getByRole('status').getByText('Registro salvo.')).toBeVisible();
  await expect(page.getByText('70,5 kg').first()).toBeVisible();
  await expect(page.getByText('172 cm').first()).toBeVisible();
  // IMC é valor só interno dos guardrails: nunca aparece (nem o número 23,8 de 70,5 kg e 172 cm).
  await expect(page.locator('main')).not.toContainText(/IMC/);
  await expect(page.getByText('23,8', { exact: true })).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test('dashboard com dados: período global, explicação e pedido de revisão do Índice', async ({
  page,
}) => {
  const { userId } = await newPerson(page, 'dashboard');
  await seedSyntheticHealthData(userId);
  await page.goto('/inicio');
  await expect(page.getByRole('heading', { name: 'Índice de Bem-Estar' })).toBeVisible();
  await expect(page.getByText(/de 100/)).toBeVisible();
  await expect(page.locator('.recharts-wrapper').first()).toBeVisible();
  await expectNoAxeViolations(page);

  await choosePeriod(page, '7 dias');
  await expect
    .poll(
      async () =>
        (await page.context().cookies()).find((c) => c.name === '__Host-hm_period')?.value,
    )
    .toContain('7d');
  await page.reload();
  await expectPeriod(page, '7 dias');
  await expect(page.getByRole('heading', { name: 'Índice de Bem-Estar' })).toBeVisible();

  await page.getByText('Como é calculado', { exact: true }).click();
  await expect(page.getByRole('table', { name: /Componentes do Índice/ })).toBeVisible();

  await page.getByRole('button', { name: 'Pedir revisão' }).click();
  // Primeira chamada da action no servidor de dev inclui a compilação.
  await expect(page.getByText(/Pedido de revisão registrado/)).toBeVisible({ timeout: 20_000 });
  const { rows } = await withAdmin((db) =>
    db.query(
      `SELECT kind, score_version, period_end - period_start AS days FROM privacy_requests
        WHERE user_id = $1`,
      [userId],
    ),
  );
  expect(rows).toEqual([{ kind: 'automated_review', score_version: 3, days: 6 }]);
});

test('após revogar os dados de bem-estar, nenhuma tela de saúde mostra dados', async ({ page }) => {
  const { userId } = await newPerson(page, 'revoga-fase2');
  await seedSyntheticHealthData(userId);
  await page.goto('/privacidade');
  await page.getByRole('button', { name: 'Revogar: Dados de bem-estar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revogar agora' }).click();
  await expect(page.getByText(/Revogado: eliminação em/)).toBeVisible();
  for (const path of ['/inicio', '/sono', '/habitos', '/corpo']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Autorização revogada' })).toBeVisible();
    await expect(page.locator('.recharts-wrapper')).toHaveCount(0);
  }
});

test('revogou em outra aba e marcou um hábito: sem página de erro, com o aviso de autorização', async ({
  page,
}) => {
  await newPerson(page, 'revoga-aba');
  await page.goto('/habitos');
  await page.getByLabel('Nome do hábito').fill('Alongar');
  await page.getByRole('button', { name: 'Criar hábito' }).click();
  await expect(page.getByRole('heading', { name: 'Alongar' })).toBeVisible();
  await page.goto('/inicio');
  const check = page.getByRole('button', { name: 'Marcar como feito: "Alongar", hoje' });
  await expect(check).toBeVisible();

  const other = await page.context().newPage();
  await other.goto('/privacidade');
  await other.getByRole('button', { name: 'Revogar: Dados de bem-estar' }).click();
  await other.getByRole('dialog').getByRole('button', { name: 'Revogar agora' }).click();
  await expect(other.getByText(/Revogado: eliminação em/)).toBeVisible();

  await check.click();
  await expect(page.getByRole('heading', { name: 'Autorização revogada' })).toBeVisible();
  await expect(page.getByText('Não foi possível carregar')).toHaveCount(0);
});
