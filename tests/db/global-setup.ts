import { execSync } from 'node:child_process';
import 'dotenv/config';
import pg from 'pg';

/**
 * Antes da suíte com banco: aplica as migrações como app_migrator e confirma que o banco responde.
 * Falha alto se o banco não estiver disponível (nunca pula em silêncio).
 */
export default async function setup() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url || !process.env.DATABASE_URL) {
    throw new Error('test:db precisa de MIGRATION_DATABASE_URL e DATABASE_URL (rode pnpm db:up).');
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.end();
  execSync('pnpm exec prisma migrate deploy', { stdio: 'ignore' });
}
