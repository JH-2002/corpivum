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

/** Cria conta adulta com e-mail verificado diretamente no banco. */
export async function createVerifiedUser(email: string, password = E2E_PASSWORD): Promise<void> {
  const hash = await hashPassword(password);
  await withAdmin((db) =>
    db.query(
      `INSERT INTO users (id, email, password_hash, adult_attested_at, age_gate_version,
                          email_verified_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, now(), 'v1', now(), now())`,
      [email, hash],
    ),
  );
}

export async function rowCounts(): Promise<Record<string, number>> {
  return withAdmin(async (db) => {
    const { rows } = await db.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'`,
    );
    const out: Record<string, number> = {};
    for (const { relname } of rows) {
      const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public."${relname}"`);
      out[relname] = r.rows[0]?.n ?? -1;
    }
    return out;
  });
}
