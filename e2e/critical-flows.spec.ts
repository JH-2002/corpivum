import { expect, test, type Page } from '@playwright/test';
import { localDay } from '../src/lib/dates';
import { createVerifiedUser, E2E_PASSWORD, e2eEmail, loginWithOwnIp, withAdmin } from './fixtures';

/**
 * Lacunas de e2e dos fluxos críticos encontradas na 7d (mapa completo em docs/qa/COBERTURA_E2E.md):
 * autorização de bem-estar dada na interface do onboarding seguida de um registro (LEG-C01), saída da conta
 * antes de concluir o onboarding (P7-M2, ADR-0037; LEG-D04) e os guardrails de ritmo e de calorias das metas
 * (LEG-M04, LEG-M07). Dados 100% sintéticos.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const count = (table: string, userId: string) =>
  withAdmin((db) =>
    db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public."${table}" WHERE user_id = $1`, [
      userId,
    ]),
  ).then((r) => r.rows[0]?.n ?? -1);

const dayInFuture = (days: number) =>
  localDay(new Date(Date.now() + days * 24 * 60 * 60 * 1000), 'America/Sao_Paulo');

async function expectSafetyBlock(page: Page) {
  const alert = page.getByRole('alert').filter({ has: page.getByTestId('guardrail-notice') });
  await expect(alert).toBeVisible();
  await expect(alert).toBeFocused();
  await expect(alert).toContainText('188');
  await expect(alert).toContainText('192');
  await expect(alert.getByRole('heading', { name: 'O app não acompanha esta meta' })).toBeVisible();
}

test('onboarding: autorizar os dados de bem-estar na interface e registrar o primeiro sono (LEG-C01)', async ({
  page,
}) => {
  const email = e2eEmail('onb-autoriza');
  const userId = await createVerifiedUser(email, E2E_PASSWORD, { onboarded: false });
  await loginWithOwnIp(page, email);
  await expect(page).toHaveURL(/\/boas-vindas\/seguranca$/);
  await page.getByRole('link', { name: 'Continuar' }).click();

  const health = page.getByRole('checkbox', { name: 'Dados de bem-estar' });
  await expect(health).not.toBeChecked();
  await health.check();
  await page.getByLabel('Li e aceito os Termos de Uso.').check();
  await page.getByLabel('Li a Política de Privacidade.').check();
  await page.getByRole('button', { name: 'Salvar escolhas e continuar' }).click();
  await expect(page).toHaveURL(/\/boas-vindas\/dados$/);
  await page.getByRole('button', { name: 'Começar com meus dados' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();

  // Só a finalidade marcada tem prova, com a versão vigente do texto.
  const { rows } = await withAdmin((db) =>
    db.query<{ purpose: string; current: boolean }>(
      `SELECT c.purpose::text,
              v.version = (SELECT max(version) FROM policy_versions WHERE document = v.document) AS current
         FROM consent_records c JOIN policy_versions v ON v.id = c.policy_version_id
        WHERE c.user_id = $1 AND c.revoked_at IS NULL`,
      [userId],
    ),
  );
  expect(rows).toEqual([{ purpose: 'health_data', current: true }]);

  await page.goto('/sono');
  await page.getByLabel('Deitei em').fill('2026-10-01T23:00');
  await page.getByLabel('Acordei em').fill('2026-10-02T07:00');
  await page.getByRole('button', { name: 'Salvar registro' }).click();
  await expect(page.getByRole('status').getByText('Registro salvo.')).toBeVisible();
  expect(await count('sleep_entries', userId)).toBe(1);
});

test('saída no onboarding: excluir a conta sem aceitar os Termos (P7-M2, LEG-D04)', async ({
  page,
}) => {
  const email = e2eEmail('onb-sai');
  const userId = await createVerifiedUser(email, E2E_PASSWORD, { onboarded: false });
  await loginWithOwnIp(page, email);
  await page
    .getByRole('link', {
      name: 'Desistiu do cadastro? Excluir a conta ou encerrar por ter menos de 18 anos',
    })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Excluir ou encerrar a conta' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Excluir minha conta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Excluir a conta agora?' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Senha atual').fill(E2E_PASSWORD);
  await dialog.getByLabel(/Para confirmar, digite/).fill('excluir minha conta');
  await dialog.getByRole('button', { name: 'Excluir minha conta agora' }).click();
  await expect(page).toHaveURL(/\/conta-excluida$/);

  // O acesso acabou na hora; a purga apaga a conta em seguida.
  await page.goto('/boas-vindas/seguranca');
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(async () => {
    const { rows } = await withAdmin((db) =>
      db.query('SELECT 1 FROM users WHERE id = $1', [userId]),
    );
    expect(rows).toHaveLength(0);
  }).toPass({ timeout: 30_000 });
});

test.describe('metas: guardrails de ritmo e de calorias (LEG-M04, LEG-M07)', () => {
  test('perda de peso rápida demais é bloqueada com apoio; o mesmo alvo com prazo longo é aceito', async ({
    page,
  }) => {
    const email = e2eEmail('metas-ritmo');
    const userId = await createVerifiedUser(email);
    // IMC do alvo dentro da faixa: só o ritmo (mais de 1% do peso por semana) bloqueia.
    await withAdmin((db) =>
      db.query(
        `INSERT INTO body_measurements (id, user_id, measured_at, weight_kg, height_cm, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, now() - interval '1 day', 80, 175, now(), now())`,
        [userId],
      ),
    );
    await loginWithOwnIp(page, email);
    await page.goto('/metas');
    await page.getByLabel('O que acompanhar').selectOption('weight_kg');
    await page.getByLabel('Alvo', { exact: true }).fill('75');
    await page.getByLabel('Prazo (opcional)').fill(dayInFuture(14));
    await page.getByRole('button', { name: 'Criar meta' }).click();
    await expectSafetyBlock(page);
    expect(await count('goals', userId)).toBe(0);

    await page.getByLabel('O que acompanhar').selectOption('weight_kg');
    await page.getByLabel('Alvo', { exact: true }).fill('75');
    await page.getByLabel('Prazo (opcional)').fill(dayInFuture(365));
    await page.getByRole('button', { name: 'Criar meta' }).click();
    await expect(page.getByText('Registro salvo.')).toBeVisible();
    expect(await count('goals', userId)).toBe(1);
  });

  test('referência de calorias: só com a estimativa ligada e nunca abaixo do piso', async ({
    page,
  }) => {
    const email = e2eEmail('metas-kcal');
    const userId = await createVerifiedUser(email);
    await loginWithOwnIp(page, email);
    await page.goto('/metas');
    const option = page.getByRole('option', { name: 'Referência diária de calorias (estimativa)' });
    // Estimativa desligada (padrão, LEG-M07): a meta de calorias nem é oferecida.
    await expect(option).toHaveCount(0);

    await withAdmin((db) =>
      db.query('UPDATE users SET calorie_estimate_enabled = true WHERE id = $1', [userId]),
    );
    await page.reload();
    await page.getByLabel('O que acompanhar').selectOption('kcal_reference_day');
    await page.getByLabel('Alvo', { exact: true }).fill('1200');
    await page.getByRole('button', { name: 'Criar meta' }).click();
    await expectSafetyBlock(page);
    expect(await count('goals', userId)).toBe(0);

    await page.getByLabel('O que acompanhar').selectOption('kcal_reference_day');
    await page.getByLabel('Alvo', { exact: true }).fill('2000');
    await page.getByRole('button', { name: 'Criar meta' }).click();
    await expect(page.getByText('Registro salvo.')).toBeVisible();
    expect(await count('goals', userId)).toBe(1);
  });
});
