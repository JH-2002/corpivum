import { expect, test as setup } from '@playwright/test';
import {
  createVerifiedUser,
  E2E_DOMAIN,
  E2E_PASSWORD,
  e2eEmail,
  STORAGE_STATE,
  withAdmin,
} from './fixtures';
import { assertDisposableDatabase } from '../tests/db/safety';

/**
 * Prepara o banco para o e2e e autentica uma pessoa sintética pela interface. Os demais testes do app
 * reutilizam a sessão (storageState). Limites de tentativa são zerados para execuções repetidas.
 */
setup('pessoa sintética autenticada', async ({ page }) => {
  assertDisposableDatabase(process.env.MIGRATION_DATABASE_URL);
  await withAdmin(async (db) => {
    await db.query('TRUNCATE rate_limit_buckets');
    await db.query('DELETE FROM users WHERE email LIKE $1', [`%@${E2E_DOMAIN}`]);
  });
  const email = e2eEmail('pessoa');
  await createVerifiedUser(email);

  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
