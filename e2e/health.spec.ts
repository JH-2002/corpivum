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

/**
 * Fase 2 (ADR-0021): passo 5 do onboarding (§52.5), registros de sono, hábitos, diário e corpo
 * (criar, editar, excluir), dashboard com período global, pedido de revisão do Índice (LEG-D08) e
 * bloqueio após revogar (LEG-C04). Cada teste usa uma pessoa sintética própria.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
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
              + (SELECT count(*) FROM journal_entries WHERE user_id = $1)
              + (SELECT count(*) FROM body_measurements WHERE user_id = $1) AS n`,
        [userId],
      ),
    ).then((r) => Number(r.rows[0]?.n));
  expect(await count()).toBe(0);

  await page.getByRole('button', { name: 'Começar com meus dados' }).click();
  const dialog = page.getByRole('dialog', { name: 'Começar com os seus dados?' });
  await dialog.getByRole('button', { name: 'Começar com meus dados' }).click();
  await expect(page.getByRole('heading', { name: 'Boas-vindas ao HealthMind 360' })).toBeVisible();
  await expect(page.getByText('Você está vendo dados de demonstração')).toHaveCount(0);
});

test('passo 5: "começar do zero" leva ao estado vazio acolhedor, sem gráfico', async ({ page }) => {
  await newPerson(page, 'zero', { dataMode: null });
  await page.getByRole('button', { name: 'Começar com meus dados' }).click();
  await expect(page.getByRole('heading', { name: 'Boas-vindas ao HealthMind 360' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('.recharts-wrapper')).toHaveCount(0);
});

test('sono: registrar, editar e excluir', async ({ page }) => {
  await newPerson(page, 'sono');
  await page.goto('/sono');
  await page.getByLabel('Deitei em').fill('2026-10-01T23:15');
  await page.getByLabel('Acordei em').fill('2026-10-02T07:05');
  await page.getByLabel('Qualidade do sono (opcional)').selectOption('4');
  await page.getByLabel('Nota (opcional)').fill('Nota sintética do teste.');
  await page.getByRole('button', { name: 'Salvar registro' }).click();
  await expect(page.getByRole('status').getByText('Registro salvo.')).toBeVisible();

  // O período padrão (30 dias) pode não incluir a data: usa um intervalo personalizado.
  await page.getByLabel('Período', { exact: true }).selectOption('custom');
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
    .getByRole('button', { name: 'Marcar "Beber água ao acordar" como feito hoje' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Desmarcar "Beber água ao acordar" de hoje' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 dia seguido')).toBeVisible();

  await page.goto('/habitos');
  await page.getByRole('button', { name: 'Ocultar sequências' }).click();
  await expect(page.getByText('As sequências (dias seguidos) estão ocultas.')).toBeVisible();
  await expect(page.getByText(/dia seguido/)).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test('diário: entrada cifrada, filtro por etiqueta e calendário, sem busca no texto', async ({
  page,
}) => {
  const { userId } = await newPerson(page, 'diario');
  await page.goto('/diario');
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'O que você quer registrar?' })
    .fill('Texto sintético do diário de teste.');
  await page.getByLabel('Natureza').check();
  await page.getByRole('button', { name: 'Salvar entrada' }).click();
  await expect(
    page.locator('li p').filter({ hasText: 'Texto sintético do diário de teste.' }),
  ).toBeVisible();

  const { rows } = await withAdmin((db) =>
    db.query<{ content: Buffer }>(
      'SELECT content_enc AS content FROM journal_entries WHERE user_id = $1',
      [userId],
    ),
  );
  expect(rows[0]?.content.includes(Buffer.from('Texto sintético'))).toBe(false);

  await page.getByLabel('Etiquetas').selectOption('work');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(
    page.locator('li p').filter({ hasText: 'Texto sintético do diário de teste.' }),
  ).toHaveCount(0);
  await page.getByLabel('Etiquetas').selectOption('nature');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(
    page.locator('li p').filter({ hasText: 'Texto sintético do diário de teste.' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Calendário' }).click();
  await expect(page.getByRole('link', { name: /1 entrada$/ })).toBeVisible();
  await expectNoAxeViolations(page);
});

test('corpo: medição com vírgula decimal e IMC estimado sem classificação', async ({ page }) => {
  await newPerson(page, 'corpo');
  await page.goto('/corpo');
  await page.getByLabel('Peso (kg)').fill('70,5');
  await page.getByLabel('Altura (cm)').fill('172');
  await page.getByRole('button', { name: 'Salvar medição' }).click();
  await expect(page.getByRole('status').getByText('Registro salvo.')).toBeVisible();
  await expect(page.getByText('70,5 kg').first()).toBeVisible();
  await expect(page.getByText('23,8', { exact: true })).toBeVisible();
  await expect(page.getByText(/sem classificação/)).toBeVisible();
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

  await page.getByLabel('Período', { exact: true }).selectOption('7d');
  await expect
    .poll(
      async () =>
        (await page.context().cookies()).find((c) => c.name === '__Host-hm_period')?.value,
    )
    .toContain('7d');
  await page.reload();
  await expect(page.getByLabel('Período', { exact: true })).toHaveValue('7d');
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
  expect(rows).toEqual([{ kind: 'automated_review', score_version: 1, days: 6 }]);
});

test('após revogar os dados de bem-estar, nenhuma tela de saúde mostra dados', async ({ page }) => {
  const { userId } = await newPerson(page, 'revoga-fase2');
  await seedSyntheticHealthData(userId);
  await page.goto('/privacidade');
  await page.getByRole('button', { name: 'Revogar: Dados de bem-estar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revogar agora' }).click();
  await expect(page.getByText(/Revogado: eliminação em/)).toBeVisible();
  for (const path of ['/inicio', '/sono', '/habitos', '/diario', '/corpo']) {
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
  const check = page.getByRole('button', { name: 'Marcar "Alongar" como feito hoje' });
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
