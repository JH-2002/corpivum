import { execSync } from 'node:child_process';
import 'dotenv/config';
import pg from 'pg';
import { assertDisposableDatabase, pointToTestDatabase } from './safety';

/**
 * Antes da suíte com banco: aponta para o banco de TESTES (ADR-0024), aplica as migrações como app_migrator e
 * confirma que o banco responde. Falha alto se o banco não estiver disponível (nunca pula em silêncio).
 */
export default async function setup() {
  pointToTestDatabase();
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url || !process.env.DATABASE_URL) {
    throw new Error('test:db precisa do banco de testes (rode pnpm db:up e pnpm db:test:init).');
  }
  assertDisposableDatabase(url);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.end();
  execSync('pnpm exec prisma migrate deploy', { stdio: 'ignore', env: process.env });
}
