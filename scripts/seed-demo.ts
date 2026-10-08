// Seed de DESENVOLVIMENTO (CLAUDE.md regra 6): cria uma pessoa fictícia com 90 dias de dados 100%
// sintéticos (o mesmo gerador da demo pública), para testar o app logado com dados.
// Uso: `pnpm db:seed` (banco local do docker-compose). Recusa banco que não seja local e APP_ENV=production.
// A senha é gerada a cada execução e mostrada só no terminal.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { createVerifiedUser, seedSyntheticHealthData, withAdmin } from '../e2e/fixtures';
import { assertLocalDatabase } from '../tests/db/safety';

const EMAIL = 'demo@exemplo.invalid';

async function main(): Promise<void> {
  if (process.env.APP_ENV !== 'development') {
    throw new Error('O seed só roda com APP_ENV=development.');
  }
  // As duas conexões (migrator e runtime) precisam ser locais e do mesmo banco (revisão B4).
  assertLocalDatabase(process.env.MIGRATION_DATABASE_URL);
  assertLocalDatabase(process.env.DATABASE_URL);
  const target = (url: string | undefined) => {
    const u = new URL(url ?? '');
    return `${u.hostname}:${u.port}${u.pathname}`;
  };
  if (target(process.env.MIGRATION_DATABASE_URL) !== target(process.env.DATABASE_URL)) {
    throw new Error('MIGRATION_DATABASE_URL e DATABASE_URL apontam para bancos diferentes.');
  }
  await withAdmin((db) => db.query('DELETE FROM users WHERE email = $1', [EMAIL]));
  const password = randomBytes(12).toString('base64url');
  const userId = await createVerifiedUser(EMAIL, password);
  const rows = await seedSyntheticHealthData(userId);
  process.stdout.write(
    `Pessoa fictícia criada: ${EMAIL} (senha: ${password}). ${rows} registros sintéticos.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'falha no seed'}\n`);
  process.exitCode = 1;
});
