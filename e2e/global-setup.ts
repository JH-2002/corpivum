import { execSync } from 'node:child_process';
import { assertDisposableDatabase } from '../tests/db/safety';

/**
 * Antes do e2e: aplica as migrações no banco de testes (a configuração já apontou as URLs para ele com
 * `pointToTestDatabase`, ADR-0024). O banco de desenvolvimento nunca é tocado.
 */
export default function globalSetup() {
  assertDisposableDatabase(process.env.MIGRATION_DATABASE_URL);
  execSync('pnpm exec prisma migrate deploy', { stdio: 'ignore', env: process.env });
}
