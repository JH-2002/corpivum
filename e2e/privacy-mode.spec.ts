import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  createVerifiedUser,
  DEMO_TOUR_SEEN_STATE,
  e2eEmail,
  loginWithOwnIp,
  seedSyntheticHealthData,
  withAdmin,
} from './fixtures';
import { settled } from './settle';

/**
 * Modo privacidade global (ADR-0035, LEG-M06): com ele ligado, nenhum valor de peso, medida, altura ou
 * calorias aparece no texto das telas nem no HTML (o servidor omite os números; não basta esconder no
 * navegador). Datas e quantidade de registros continuam. Dados 100% sintéticos.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const PRIVACY_COOKIE = '__Host-hm_privacy';
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const UNIT_VALUE = /\d+(,\d+)?\s?(kg|cm|kcal)\b/;
const SCREENS = [
  { path: '/inicio', title: 'Início' },
  { path: '/corpo', title: 'Corpo' },
  { path: '/twin', title: 'Health Twin' },
  { path: '/metas', title: 'Metas' },
  { path: '/timeline', title: 'Timeline' },
  { path: '/alimentacao', title: 'Alimentação' },
  { path: '/relatorios', title: 'Relatórios' },
] as const;

/** Valores decimais gravados para a pessoa (corpo e calorias), nas duas grafias (72.4 e 72,4). */
async function storedValues(userId: string): Promise<string[]> {
  return withAdmin(async (db) => {
    const { rows } = await db.query<{ v: number }>(
      `SELECT unnest(ARRAY[weight_kg, height_cm, waist_cm, hip_cm, arm_cm, thigh_cm, chest_cm]) AS v
         FROM body_measurements WHERE user_id = $1
       UNION SELECT kcal_estimate::float FROM meal_entries WHERE user_id = $1`,
      [userId],
    );
    const decimals = rows
      .map((r) => r.v)
      .filter((v): v is number => v !== null && !Number.isInteger(v))
      .map((v) => v.toFixed(1));
    return [...new Set(decimals.flatMap((v) => [v, v.replace('.', ',')]))];
  });
}

/** O número sozinho, sem ser parte de outro (ex.: 83,7 em 183,75). */
function isolated(value: string): RegExp {
  return new RegExp(`(?<![\\d.,])${value.replace(/[.,]/, (c) => `\\${c}`)}(?![\\d])`);
}

/** Liga pelo header e espera o cookie gravado (a action roda em segundo plano). */
async function turnOn(page: Page) {
  await page.getByRole('button', { name: 'Modo privacidade', exact: true }).click();
  await expect
    .poll(
      async () => (await page.context().cookies()).find((c) => c.name === PRIVACY_COOKIE)?.value,
    )
    .toBe('on');
}

test('ligado, nenhum valor do corpo nem calorias no texto e no HTML das telas', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const email = e2eEmail('modo-privacidade');
  const userId = await createVerifiedUser(email);
  await seedSyntheticHealthData(userId);
  // Valores distintos de hoje, para conferir que somem e voltam.
  await withAdmin((db) =>
    db.query(
      `INSERT INTO body_measurements (id, user_id, measured_at, weight_kg, height_cm, waist_cm, updated_at)
       VALUES (gen_random_uuid(), $1, now(), 83.7, 176.4, 91.3, now())`,
      [userId],
    ),
  );
  const values = await storedValues(userId);
  expect(values).toContain('83,7');

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await loginWithOwnIp(page, email);
  await page.goto('/corpo');
  await expect(page.getByText('83,7 kg', { exact: true })).toBeVisible();
  // Controle: desligado, o valor vai nas props do twin (payload do servidor) e a conferência o encontra.
  await page.goto('/twin');
  await expect(page.getByRole('heading', { level: 1, name: 'Health Twin' })).toBeVisible();
  const before = (await page.content()).replace(/<svg[\s\S]*?<\/svg>/g, '');
  expect(isolated('83.7').test(before)).toBe(true);
  await page.goto('/corpo');

  await turnOn(page);
  await expect(page.getByRole('button', { name: 'Modo privacidade', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('Modo privacidade ativo.')).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === PRIVACY_COOKIE);
  expect(cookie).toMatchObject({ value: 'on', httpOnly: true, secure: true, expires: -1 });

  for (const screen of SCREENS) {
    await page.goto(screen.path);
    await expect(page.getByRole('heading', { level: 1, name: screen.title })).toBeVisible();
    await expect(page.getByText('Modo privacidade ativo.')).toBeVisible();
    if (screen.path === '/inicio') {
      // O twin do início chega depois da carga (ADR-0049): varre com ele na tela.
      const hero = page.locator('[data-tour="twin-hero"]');
      await expect(hero).toContainText('forma de referência');
      await expect(hero.getByRole('button', { name: 'Cintura' })).toBeVisible();
    }
    const text = await page.locator('main').innerText();
    expect(text, screen.path).not.toMatch(UNIT_VALUE);
    // O desenho dos gráficos (coordenadas do SVG) fica de fora; os dados que alimentariam um gráfico estão
    // no payload do servidor, que continua na conferência.
    const html = (await page.content()).replace(/<svg[\s\S]*?<\/svg>/g, '');
    for (const v of values) expect(isolated(v).test(html), `${screen.path}: ${v}`).toBe(false);
  }
  // Datas e quantidade de registros continuam (PR3-B3).
  await page.goto('/corpo');
  await expect(page.getByText(/medições?\. Os valores estão ocultos\./)).toBeVisible();
  const axe = await new AxeBuilder({ page: await settled(page) }).withTags(WCAG_TAGS).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // Desligar devolve os valores.
  await page.getByRole('button', { name: 'Desligar o modo privacidade' }).click();
  await expect(page.getByText('83,7 kg', { exact: true })).toBeVisible();
  await context.close();
});

test.describe('demo público', () => {
  test.use({ storageState: DEMO_TOUR_SEEN_STATE });

  test('também vale no demo, só com cookie de sessão sem identificador', async ({
    page,
    context,
  }) => {
    await page.goto('/demo/corpo');
    await expect(page.locator('main')).toContainText(UNIT_VALUE);
    await turnOn(page);
    await expect(page.getByText('Modo privacidade ativo.')).toBeVisible();
    for (const path of ['/demo', '/demo/corpo', '/demo/metas', '/demo/timeline', '/demo/twin']) {
      await page.goto(path);
      await expect(page.getByText('Modo privacidade ativo.')).toBeVisible();
      expect(await page.locator('main').innerText(), path).not.toMatch(UNIT_VALUE);
    }
    const names = (await context.cookies()).map((c) => c.name).sort();
    expect(names).toEqual([PRIVACY_COOKIE]);
  });
});
