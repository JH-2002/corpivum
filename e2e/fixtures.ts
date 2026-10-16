import { randomBytes } from 'node:crypto';
import 'dotenv/config';
import type { Page } from '@playwright/test';
import pg from 'pg';
import { LocalKmsProvider } from '../src/adapters/kms/local';
import { APP_TIME_ZONE, localDay } from '../src/lib/dates';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/modules/auth/password';
import { withConsentOn } from '../src/modules/consent/guard';
import { generateDemoData } from '../src/modules/demo/generator';
import { seedSyntheticData } from '../src/modules/demo/seed';
import { createFieldCipher } from '../src/modules/health/core';

/**
 * Apoio aos testes e2e: usuários 100% sintéticos no domínio reservado `e2e.exemplo.test`
 * (CLAUDE.md regra 6). A conexão administrativa (app_migrator) só prepara e inspeciona o banco.
 */
export const E2E_DOMAIN = 'e2e.exemplo.test';
export const E2E_PASSWORD = 'cavalo bateria grampo e2e';
export const STORAGE_STATE = 'e2e/.auth/pessoa.json';
/** Mesma origem do `baseURL` do playwright.config.ts. */
export const E2E_ORIGIN = 'http://localhost:3100';

/**
 * Demo público sem sessão e com o tour do painel já visto (ADR-0025): o tour é modal e cobriria a tela
 * nos testes que não são sobre ele.
 */
export const DEMO_TOUR_SEEN_STATE = {
  cookies: [],
  origins: [{ origin: E2E_ORIGIN, localStorage: [{ name: 'hm_tour_demo_seen', value: '1' }] }],
};

export async function withAdmin<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

export function e2eEmail(name: string): string {
  // Sufixo de `node:crypto` (CodeQL js/insecure-randomness): o e-mail vira credencial de login nos testes.
  return `${name}.${Date.now()}.${randomBytes(4).toString('hex')}@${E2E_DOMAIN}`;
}

type Purpose = 'health_data' | 'marketing' | 'product_metrics';

/**
 * Cria conta adulta com e-mail verificado diretamente no banco. Por padrão já com o onboarding concluído
 * (Termos e Política aceitos na versão vigente), só o consentimento de dados de bem-estar (§52, LEG-C01) e
 * o passo 5 escolhido como "começar do zero" (`dataMode: 'own'`). `dataMode: null` para no passo 5;
 * `onboarded: false` deixa a conta no início do onboarding. O tour do painel já vem marcado como visto
 * (`tourSeen: false` para testar a primeira visita, ADR-0025).
 */
export async function createVerifiedUser(
  email: string,
  password = E2E_PASSWORD,
  options: {
    onboarded?: boolean;
    purposes?: Purpose[];
    dataMode?: 'own' | 'demo' | null;
    tourSeen?: boolean;
  } = {},
): Promise<string> {
  const {
    onboarded = true,
    purposes = ['health_data'],
    dataMode = 'own',
    tourSeen = true,
  } = options;
  const hash = await hashPassword(password);
  return withAdmin(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (id, email, password_hash, adult_attested_at, age_gate_version,
                          email_verified_at, onboarding_completed_at, data_mode, tour_seen, updated_at)
       VALUES (gen_random_uuid(), $1, $2, now(), 'v1', now(), CASE WHEN $3 THEN now() END,
               CASE WHEN $3 THEN $4::data_mode END, $5, now())
       RETURNING id`,
      [email, hash, onboarded, dataMode, tourSeen],
    );
    const userId = rows[0]?.id ?? '';
    if (!onboarded) return userId;
    const latest = `SELECT DISTINCT ON (document) id, document, text_hash FROM policy_versions
                     ORDER BY document, version DESC`;
    await db.query(
      `INSERT INTO policy_acceptances (id, user_id, policy_version_id, accepted_at, updated_at)
       SELECT gen_random_uuid(), $1, v.id, now(), now() FROM (${latest}) v
        WHERE v.document IN ('terms', 'privacy_policy')`,
      [userId],
    );
    await db.query(
      `INSERT INTO consent_records (id, user_id, purpose, policy_version_id, text_hash, granted_at,
                                    updated_at)
       SELECT gen_random_uuid(), $1, p.purpose::consent_purpose, v.id, v.text_hash, now(), now()
         FROM unnest($2::text[]) AS p(purpose)
         JOIN (${latest}) v ON v.document::text = 'consent_' || p.purpose`,
      [userId, purposes],
    );
    return userId;
  });
}

/**
 * Conta de antes da v2 do consentimento de bem-estar (ADR-0027): a prova aponta para a v1, então o login leva à
 * reorientação (`/boas-vindas/atualizacao`, LEG-C06). O gatilho só aceita a versão vigente, então a linha entra
 * com os gatilhos desligados numa transação (banco local de teste).
 */
export async function createUserWithOutdatedHealthConsent(email: string): Promise<string> {
  const userId = await createVerifiedUser(email, E2E_PASSWORD, { purposes: [] });
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
  return userId;
}

/** Liga o 2º fator direto no banco: o login para em `/entrar/verificacao` (a tela não lê o segredo). */
export async function enableMfaFlag(userId: string): Promise<void> {
  await withAdmin((db) =>
    db.query('UPDATE users SET mfa_enabled_at = now() WHERE id = $1', [userId]),
  );
}

/**
 * Linhas por tabela. `access_logs` e `job_queue` ficam de fora: outros testes em paralelo (sessões
 * existentes, jobs do servidor) escrevem nelas, nunca para quem não tem conta.
 */
export async function rowCounts(): Promise<Record<string, number>> {
  return withAdmin(async (db) => {
    const { rows } = await db.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND c.relname NOT IN ('_prisma_migrations', 'access_logs', 'job_queue')`,
    );
    const out: Record<string, number> = {};
    for (const { relname } of rows) {
      const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public."${relname}"`);
      out[relname] = r.rows[0]?.n ?? -1;
    }
    return out;
  });
}

/**
 * Grava 90 dias de dados SINTÉTICOS (gerador da demo) na conta, pelo caminho do app: consentimento + RLS
 * como `app_user` e texto livre cifrado com a chave local de desenvolvimento (CLAUDE.md regra 6).
 */
export async function seedSyntheticHealthData(userId: string): Promise<number> {
  // Mesmo client do runtime (app_user, RLS), criado aqui porque `src/lib/db/client` é só do Next.
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
    errorFormat: 'minimal',
  });
  try {
    const kms = new LocalKmsProvider(process.env.KMS_LOCAL_MASTER_KEY ?? '');
    return await seedSyntheticData({
      run: (id, fn) => withConsentOn(db, id, 'health_data', fn),
      cipher: createFieldCipher(kms),
      userId,
      data: generateDemoData(localDay(new Date(), APP_TIME_ZONE), APP_TIME_ZONE),
    });
  } finally {
    await db.$disconnect();
  }
}

/**
 * Linhas criadas desde `since` que NÃO pertencem a contas do e2e (por `user_id`, `subject_user_id` ou o
 * próprio `users.id`). Outros testes em paralelo só escrevem em contas do e2e; o demo público e o fluxo de
 * menor não podem escrever nada. Ficam de fora tabelas técnicas escritas por qualquer login (limites,
 * fila, registros de acesso).
 */
export async function foreignRowsSince(since: Date): Promise<Record<string, number>> {
  return withAdmin(async (db) => {
    const { rows } = await db.query<{ table: string; owner: string | null }>(
      `SELECT c.relname AS table,
              (SELECT a.attname FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attname IN ('user_id', 'subject_user_id')
                  AND NOT a.attisdropped LIMIT 1) AS owner
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND c.relname NOT IN ('_prisma_migrations', 'access_logs', 'job_queue',
                                'rate_limit_buckets', 'policy_versions')`,
    );
    const out: Record<string, number> = {};
    for (const { table, owner } of rows) {
      const ownerColumn = table === 'users' ? 'id' : owner;
      const notE2e = ownerColumn
        ? `AND (t."${ownerColumn}" IS NULL OR t."${ownerColumn}" NOT IN
             (SELECT id FROM users WHERE email LIKE '%@${E2E_DOMAIN}'))`
        : '';
      const r = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM public."${table}" t WHERE t.created_at >= $1 ${notE2e}`,
        [since],
      );
      out[table] = r.rows[0]?.n ?? -1;
    }
    return out;
  });
}

let ipCounter = 0;

/**
 * Login pela interface com um IP de documentação próprio (RFC 5737), para os testes não esgotarem o
 * limite de logins por IP (LEG-S05) uns dos outros. Em dev/test vale o último salto do X-Forwarded-For.
 */
export async function loginWithOwnIp(
  page: Page,
  email: string,
  password = E2E_PASSWORD,
  landing: RegExp = /\/(inicio|boas-vindas\/[a-z]+)$/,
) {
  ipCounter += 1;
  const ip = `203.0.113.${((process.pid * 7 + ipCounter) % 250) + 1}`;
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': ip });
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(landing);
}
