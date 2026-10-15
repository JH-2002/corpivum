import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createVerifiedUser, E2E_PASSWORD, e2eEmail, withAdmin } from './fixtures';

/**
 * Fase 1b (ADR-0019): Central de Privacidade, revogação imediata (LEG-C04), encerramento de conta de menor
 * (LEG-F04), páginas públicas (§53, LEG-D06) e acessibilidade das telas novas (LEG-X01).
 */
test.use({ storageState: { cookies: [], origins: [] } });

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function login(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`),
  ).toEqual([]);
}

test('revogar os dados de bem-estar: aviso com a data, bloqueio imediato e reautorização', async ({
  page,
}) => {
  const email = e2eEmail('revoga-saude');
  await createVerifiedUser(email);
  await login(page, email);
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();

  await page.goto('/sono');
  await expect(page.getByRole('heading', { name: 'Registro de bem-estar desativado' })).toHaveCount(
    0,
  );

  await page.goto('/privacidade');
  await page.getByRole('button', { name: 'Revogar: Dados de bem-estar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Revogar o uso dos dados de bem-estar?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/serão eliminados em .+ \(30 dias\)/)).toBeVisible();
  await expect(dialog.getByText(/autorizar de novo antes dessa data/)).toBeVisible();
  await expectNoAxeViolations(page);
  await dialog.getByRole('button', { name: 'Revogar agora' }).click();
  await expect(page.getByText(/Revogado: eliminação em/)).toBeVisible();

  // Bloqueio imediato: o módulo não exibe nada e explica como reautorizar.
  await page.goto('/sono');
  await expect(page.getByRole('heading', { name: 'Autorização revogada' })).toBeVisible();

  await page.goto('/privacidade');
  await page.getByRole('button', { name: 'Autorizar: Dados de bem-estar' }).click();
  await expect(page.getByRole('button', { name: 'Revogar: Dados de bem-estar' })).toBeVisible();
  await page.goto('/sono');
  await expect(page.getByRole('heading', { name: 'Autorização revogada' })).toHaveCount(0);

  const { rows } = await withAdmin((db) =>
    db.query(
      `SELECT u.health_data_purge_at, array_agg(a.action::text ORDER BY a.created_at) AS actions
         FROM users u JOIN audit_logs a ON a.subject_user_id = u.id
        WHERE u.email = $1 AND a.action::text LIKE 'health_data%' GROUP BY u.id`,
      [email],
    ),
  );
  expect(rows[0].health_data_purge_at).toBeNull();
  expect(rows[0].actions).toEqual([
    'health_data_elimination_scheduled',
    'health_data_elimination_cancelled',
  ]);
});

test('reorientação: quem autorizou a v1 da saúde revê o texto novo antes de continuar (LEG-C06)', async ({
  page,
}) => {
  const email = e2eEmail('reconsente-v2');
  const userId = await createVerifiedUser(email, E2E_PASSWORD, { purposes: [] });
  // Conta de antes da v2 (ADR-0027): a prova aponta para a v1. O gatilho só aceita a versão vigente,
  // então a linha entra com os gatilhos desligados numa transação (banco local de teste).
  await withAdmin(async (db) => {
    await db.query('BEGIN');
    try {
      await db.query('ALTER TABLE consent_records DISABLE TRIGGER USER');
      await db.query(
        `INSERT INTO consent_records (id, user_id, purpose, policy_version_id, text_hash, granted_at,
                                      updated_at)
         SELECT gen_random_uuid(), $1, 'health_data', v.id, v.text_hash, now() - interval '1 day', now()
           FROM policy_versions v WHERE v.document = 'consent_health_data' AND v.version = 1`,
        [userId],
      );
      await db.query('ALTER TABLE consent_records ENABLE TRIGGER USER');
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  });

  await login(page, email);
  await expect(page).toHaveURL(/\/boas-vindas\/atualizacao/);
  await expect(page.getByRole('heading', { name: 'Atualizamos nossos documentos' })).toBeVisible();
  await expect(
    page.getByText(/peso e medidas, sono, hábitos, alimentação e atividade física/),
  ).toBeVisible();
  await expect(page.getByText(/humor|diário|medicamentos/i)).toHaveCount(0);
  await expectNoAxeViolations(page);
  await page.getByRole('radio', { name: 'Manter autorização' }).check();
  await page.getByRole('button', { name: 'Salvar e continuar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
});

test('marketing: autorizar e revogar com 1 clique cada, sem afetar o resto (LEG-C04/C05)', async ({
  page,
}) => {
  const email = e2eEmail('marketing');
  await createVerifiedUser(email);
  await login(page, email);
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
  await page.goto('/privacidade');
  await page.getByRole('button', { name: 'Autorizar: Comunicações sobre novidades' }).click();
  await page.getByRole('button', { name: 'Revogar: Comunicações sobre novidades' }).click();
  await expect(
    page.getByRole('button', { name: 'Autorizar: Comunicações sobre novidades' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revogar: Dados de bem-estar' })).toBeVisible();
});

test('menor de 18 encerra a conta: apagada na hora, só a prova mínima fica (LEG-F04)', async ({
  page,
}) => {
  const email = e2eEmail('menor');
  const userId = await createVerifiedUser(email);
  await login(page, email);
  await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
  await page.goto('/privacidade');
  await page.getByRole('button', { name: 'Encerrar minha conta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Encerrar e apagar a conta agora?' });
  await expect(dialog).toBeVisible();
  await expectNoAxeViolations(page);

  await dialog.getByLabel('Senha atual').fill('senha errada sintética');
  await dialog.getByRole('button', { name: 'Encerrar e apagar agora' }).click();
  await expect(dialog.getByText(/Não foi possível confirmar/).first()).toBeVisible();

  await dialog.getByLabel('Senha atual').fill(E2E_PASSWORD);
  await dialog.getByRole('button', { name: 'Encerrar e apagar agora' }).click();
  await expect(page).toHaveURL(/\/conta-encerrada$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Conta encerrada' })).toBeVisible();

  const { rows } = await withAdmin((db) =>
    db.query(
      `SELECT (SELECT count(*) FROM users WHERE id = $1)::int AS users,
              (SELECT count(*) FROM sessions WHERE user_id = $1)::int AS sessions,
              (SELECT count(*) FROM privacy_requests WHERE user_id = $1 AND kind = 'minor_closure')::int
                AS proof`,
      [userId],
    ),
  );
  expect(rows[0]).toEqual({ users: 0, sessions: 0, proof: 1 });

  await page.goto('/inicio');
  await expect(page).toHaveURL(/\/entrar$/);
  // Novo cadastro imediato é desencorajado sem identificar ninguém (LEG-F01).
  await page.goto('/cadastro');
  await expect(page).toHaveURL(/\/cadastro\/indisponivel$/);
});

test.describe('páginas públicas (§53, LEG-D06) e acessibilidade', () => {
  for (const [path, title] of [
    ['/legal/politica-de-privacidade', 'Política de Privacidade'],
    ['/legal/termos', 'Termos de Uso'],
    ['/legal/subprocessadores', 'Subprocessadores'],
    ['/legal/encarregado', 'Encarregado e contato'],
    ['/conta-encerrada', 'Conta encerrada'],
    ['/conta-excluida', 'Conta excluída'],
  ] as const) {
    test(`${path} abre sem login e sem violações (rascunho nos documentos)`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      if (path.startsWith('/legal')) {
        await expect(page.getByText('RASCUNHO — revisão jurídica obrigatória.')).toBeVisible();
      }
      await expectNoAxeViolations(page);
    });
  }

  test('onboarding e Central de Privacidade sem violações (claro e escuro)', async ({ page }) => {
    const email = e2eEmail('a11y-onboarding');
    await createVerifiedUser(email, E2E_PASSWORD, { onboarded: false });
    await login(page, email);
    await expect(page).toHaveURL(/\/boas-vindas\/seguranca$/);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/boas-vindas/seguranca');
      await expectNoAxeViolations(page);
      await page.goto('/boas-vindas/consentimentos');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Suas escolhas de privacidade' }),
      ).toBeVisible();
      await expectNoAxeViolations(page);
    }
    // Sem onboarding, a Central não abre ainda: o app leva de volta ao onboarding.
    await page.goto('/privacidade');
    await expect(page).toHaveURL(/\/boas-vindas\/seguranca$/);
  });

  test('Central de Privacidade sem rolagem horizontal em 320px', async ({ page }) => {
    const email = e2eEmail('responsivo-privacidade');
    await createVerifiedUser(email);
    await page.setViewportSize({ width: 320, height: 640 });
    await login(page, email);
    await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
    await page.goto('/privacidade');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
