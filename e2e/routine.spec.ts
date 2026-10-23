import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createVerifiedUser, E2E_PASSWORD, e2eEmail, loginWithOwnIp, withAdmin } from './fixtures';
import { chooseOption } from './choice';

/**
 * Fase 4 (ADR-0029): alimentação, atividade, metas com guardrails, lembretes e timeline, com dados
 * próprios. Cada teste usa uma pessoa sintética própria (LEG-M04, LEG-M07, LEG-M08, LEG-F05).
 */
test.use({ storageState: { cookies: [], origins: [] } });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`),
  ).toEqual([]);
}

async function newPerson(page: Page, name: string) {
  const email = e2eEmail(name);
  const userId = await createVerifiedUser(email, E2E_PASSWORD);
  await loginWithOwnIp(page, email);
  return { email, userId };
}

const count = (table: string, userId: string) =>
  withAdmin((db) =>
    db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public."${table}" WHERE user_id = $1`, [
      userId,
    ]),
  ).then((r) => r.rows[0]?.n ?? -1);

test('alimentação: refeição em poucos toques, água em um toque, calorias só se ligadas', async ({
  page,
}) => {
  const { userId } = await newPerson(page, 'alimentacao');
  await page.goto('/alimentacao');
  await expect(page.getByRole('heading', { level: 1, name: 'Alimentação' })).toBeVisible();
  // Estimativa desligada por padrão: sem campo de calorias.
  await expect(page.getByRole('spinbutton', { name: /Estimativa de calorias/ })).toHaveCount(0);
  await expectNoAxeViolations(page);

  await chooseOption(page, 'Refeição', 'breakfast');
  await page.getByRole('button', { name: 'Registrar refeição' }).click();
  await expect(page.getByText('Registro salvo.')).toBeVisible();
  await expect(page.getByText(/Café da manhã às/)).toBeVisible();

  await page.getByRole('button', { name: 'Adicionar 300 ml de água hoje' }).click();
  await expect(page.getByText('Hoje: 300 ml')).toBeVisible();

  await page.getByRole('button', { name: 'Ligar estimativa' }).click();
  await expect(page.getByRole('button', { name: 'Desligar estimativa' })).toBeVisible();
  await expect(
    page.getByRole('spinbutton', { name: /Estimativa de calorias/ }).first(),
  ).toBeVisible();
  expect(await count('meal_entries', userId)).toBe(1);
  expect(await count('water_entries', userId)).toBe(1);
});

test('atividade: séries de força e progressão por exercício, sem sugestão de carga', async ({
  page,
}) => {
  await newPerson(page, 'atividade');
  await page.goto('/atividade');
  await chooseOption(page, 'Tipo', 'strength');
  await page.getByLabel('Duração (minutos)').fill('40');
  await page.locator('summary', { hasText: 'Séries de força (opcional)' }).click();
  const sets = page.getByRole('group', { name: /Série/ });
  await sets.nth(0).getByLabel('Exercício').fill('Agachamento');
  await sets.nth(0).getByLabel('Repetições').fill('10');
  await sets.nth(0).getByLabel('Carga em kg (opcional)').fill('20');
  await sets.nth(1).getByLabel('Exercício').fill('Agachamento');
  await sets.nth(1).getByLabel('Repetições').fill('10');
  await sets.nth(1).getByLabel('Carga em kg (opcional)').fill('22,5');
  await page.getByRole('button', { name: 'Registrar atividade' }).click();
  await expect(page.getByText('Registro salvo.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Progressão por exercício' })).toBeVisible();
  await expect(page.getByText('Carga máxima na última sessão: 22,5 kg')).toBeVisible();
  await expect(page.getByText(/kcal|calorias/i)).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test('metas: perda insegura é bloqueada com apoio e nada é gravado; ganho é aceito', async ({
  page,
}) => {
  const { userId } = await newPerson(page, 'metas');
  // Peso e altura sintéticos (sem texto livre, sem cifra), como se registrados em Corpo.
  await withAdmin((db) =>
    db.query(
      `INSERT INTO body_measurements (id, user_id, measured_at, weight_kg, height_cm, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, now() - interval '1 day', 60, 175, now(), now())`,
      [userId],
    ),
  );
  await page.goto('/metas');
  await expect(page.getByRole('heading', { level: 1, name: 'Metas' })).toBeVisible();
  await chooseOption(page, 'O que acompanhar', 'weight_kg');
  await page.getByLabel('Alvo', { exact: true }).fill('55');
  await page.getByLabel('Prazo (opcional)').fill('2030-01-01');
  await page.getByRole('button', { name: 'Criar meta' }).click();
  const notice = page.getByTestId('guardrail-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('188');
  await expect(notice).toContainText('192');
  await expect(
    notice.getByRole('heading', { name: 'O app não acompanha esta meta' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
  expect(await count('goals', userId)).toBe(0);

  // O formulário volta ao estado inicial depois do bloqueio (nenhum número inseguro fica na tela).
  await expect(page.getByLabel('Alvo', { exact: true })).toHaveValue('');
  await chooseOption(page, 'O que acompanhar', 'weight_kg');
  await page.getByLabel('Alvo', { exact: true }).fill('64');
  await page.getByRole('button', { name: 'Criar meta' }).click();
  await expect(page.getByText('Registro salvo.')).toBeVisible();
  expect(await count('goals', userId)).toBe(1);
  await expect(page.getByText(/Peso mais recente: 60 kg/)).toBeVisible();
  // Meta de peso sem barra de progresso nem comemoração (LEG-M06).
  await expect(page.getByRole('progressbar')).toHaveCount(0);
});

test('lembretes e timeline: criar lembrete e filtrar a linha do tempo', async ({ page }) => {
  const { userId } = await newPerson(page, 'lembretes');
  await page.goto('/habitos#lembretes');
  await page.locator('summary', { hasText: 'Criar lembrete' }).click();
  await chooseOption(page, 'Tipo de lembrete', 'daily_log');
  await page.getByLabel('Horário', { exact: true }).fill('20:30');
  await page.getByRole('button', { name: 'Criar lembrete' }).click();
  await expect(page.getByText('Registro salvo.')).toBeVisible();
  await expect(page.getByText('Registro do dia às 20:30')).toBeVisible();
  expect(await count('reminders', userId)).toBe(1);

  await page.goto('/alimentacao');
  await page.getByRole('button', { name: 'Adicionar 200 ml de água hoje' }).click();
  await expect(page.getByText('Hoje: 200 ml')).toBeVisible();
  await page.goto('/timeline');
  await expect(page.getByText('200 ml de água')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Mostrar' })
    .getByRole('link', { name: 'Sono' })
    .click();
  await expect(page).toHaveURL(/dominio=sleep/);
  await expect(page.getByText('200 ml de água')).toHaveCount(0);
  await expectNoAxeViolations(page);
});
