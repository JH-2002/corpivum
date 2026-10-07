import 'dotenv/config';
import pg from 'pg';
import { hashPassword } from '../src/modules/auth/password';

/**
 * Apoio aos testes e2e: usuários 100% sintéticos no domínio reservado `e2e.exemplo.test`
 * (CLAUDE.md regra 6). A conexão administrativa (app_migrator) só prepara e inspeciona o banco.
 */
export const E2E_DOMAIN = 'e2e.exemplo.test';
export const E2E_PASSWORD = 'cavalo bateria grampo e2e';
export const STORAGE_STATE = 'e2e/.auth/pessoa.json';

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
  return `${name}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@${E2E_DOMAIN}`;
}

type Purpose = 'health_data' | 'marketing' | 'product_metrics';

/**
 * Cria conta adulta com e-mail verificado diretamente no banco. Por padrão já com o onboarding concluído
 * (Termos e Política aceitos na versão vigente) e só o consentimento de dados de bem-estar (§52, LEG-C01).
 * `onboarded: false` deixa a conta no início do onboarding.
 */
export async function createVerifiedUser(
  email: string,
  password = E2E_PASSWORD,
  options: { onboarded?: boolean; purposes?: Purpose[] } = {},
): Promise<string> {
  const { onboarded = true, purposes = ['health_data'] } = options;
  const hash = await hashPassword(password);
  return withAdmin(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (id, email, password_hash, adult_attested_at, age_gate_version,
                          email_verified_at, onboarding_completed_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, now(), 'v1', now(), CASE WHEN $3 THEN now() END, now())
       RETURNING id`,
      [email, hash, onboarded],
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
