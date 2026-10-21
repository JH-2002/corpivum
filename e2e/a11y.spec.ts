import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  createUserWithOutdatedHealthConsent,
  createVerifiedUser,
  DEMO_TOUR_SEEN_STATE,
  e2eEmail,
  enableMfaFlag,
  loginWithOwnIp,
} from './fixtures';
import { PAGES, type PageAccess, type PageEntry } from './routes';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// Tema único escuro (ADR-0046).
const SCHEMES = ['dark'] as const;

/**
 * LEG-X01 (7d): nenhuma violação WCAG 2.2 AA detectável pelo axe em NENHUMA página do app, nos temas claro e
 * escuro. O inventário (`PAGES`) é conferido contra `src/app` por `tests/content/page-inventory.test.ts`.
 */
async function expectNoViolations(page: Page, entry: PageEntry) {
  await expect.poll(() => new URL(page.url()).pathname).toBe(entry.path);
  if (entry.title) {
    await expect(page.getByRole('heading', { level: 1, name: entry.title })).toBeVisible();
  } else {
    await expect(page.locator('h1').first()).toBeAttached();
  }
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`),
    entry.path,
  ).toEqual([]);
}

const byAccess = (access: PageAccess) => PAGES.filter((p) => p.access === access);

// Páginas que abrem direto: uma execução por página e tema.
for (const colorScheme of SCHEMES) {
  test.describe(`axe — tema ${colorScheme}`, () => {
    test.use({ colorScheme });

    test.describe('área logada (pessoa com dados sintéticos)', () => {
      for (const entry of byAccess('app')) {
        test(`${entry.path}`, async ({ page }) => {
          await page.goto(entry.path);
          await expectNoViolations(page, entry);
        });
      }
    });

    test.describe('sem sessão (públicas e demo)', () => {
      test.use({ storageState: DEMO_TOUR_SEEN_STATE });
      for (const entry of [...byAccess('public'), ...byAccess('demo')]) {
        test(`${entry.path}`, async ({ page }) => {
          await page.goto(entry.path);
          await expectNoViolations(page, entry);
        });
      }
    });
  });
}

/** Páginas que dependem de um estado da conta: uma pessoa nova por grupo, os dois temas na mesma sessão. */
async function inBothSchemes(page: Page, entries: readonly PageEntry[]) {
  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    for (const entry of entries) {
      await page.goto(entry.path);
      await expectNoViolations(page, entry);
    }
  }
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

test.describe('axe — páginas que dependem do estado da conta (claro e escuro)', () => {
  test('cadastro depois da data de nascimento', async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    await page.goto('/cadastro');
    await page.getByLabel('Data de nascimento').fill('1990-05-20');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL(/\/cadastro\/conta$/);
    await inBothSchemes(page, byAccess('age-ok'));
    await context.close();
  });

  test('onboarding (segurança, escolhas e saída)', async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    const email = e2eEmail('a11y-onb');
    await createVerifiedUser(email, undefined, { onboarded: false });
    await loginWithOwnIp(page, email);
    await inBothSchemes(page, byAccess('onboarding'));
    await context.close();
  });

  test('passo 5 (demonstração ou começar do zero)', async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    const email = e2eEmail('a11y-passo5');
    await createVerifiedUser(email, undefined, { dataMode: null });
    await loginWithOwnIp(page, email);
    await inBothSchemes(page, byAccess('data-choice'));
    await context.close();
  });

  test('reorientação com texto novo (LEG-C06)', async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    const email = e2eEmail('a11y-reorienta');
    await createUserWithOutdatedHealthConsent(email);
    await loginWithOwnIp(page, email, undefined, /\/boas-vindas\/atualizacao$/);
    await inBothSchemes(page, byAccess('update'));
    await context.close();
  });

  test('segundo fator pendente', async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    const email = e2eEmail('a11y-mfa');
    await enableMfaFlag(await createVerifiedUser(email));
    await loginWithOwnIp(page, email, undefined, /\/entrar\/verificacao$/);
    await inBothSchemes(page, byAccess('mfa'));
    await context.close();
  });
});

test.describe('axe — diálogos e estados de tela', () => {
  for (const colorScheme of SCHEMES) {
    test(`registro rápido aberto (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/inicio');
      await page.getByRole('button', { name: 'Registrar' }).first().click();
      await expect(page.getByRole('dialog', { name: 'O que você quer registrar?' })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }

  for (const state of ['loading', 'error', 'no-data', 'partial'] as const) {
    test(`?state=${state} sem violações`, async ({ page }) => {
      await page.goto(`/sono?state=${state}`);
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }
});
