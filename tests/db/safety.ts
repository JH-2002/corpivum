/**
 * Travas dos scripts e testes que APAGAM ou gravam dados sintéticos (CLAUDE.md regra 6, ADR-0024).
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db']);

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

/** Banco local (ou CI) e nunca com APP_ENV=production. Usado pelo seed de desenvolvimento. */
export function assertLocalDatabase(url: string | undefined): void {
  if (!url) throw new Error('URL do banco não definida.');
  if (process.env.APP_ENV === 'production') {
    throw new Error('Recusado com APP_ENV=production.');
  }
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host) && !process.env.CI) {
    throw new Error(`Só roda contra banco local (host atual: ${host}).`);
  }
}

/**
 * Banco de TESTES: local (ou CI), nome terminado em `_test` e diferente do banco de desenvolvimento
 * (`APP_DB_NAME`). `test:db` e e2e apagam tabelas: nunca podem alcançar a base de desenvolvimento.
 */
export function assertDisposableDatabase(url: string | undefined): void {
  assertLocalDatabase(url);
  const name = databaseName(url ?? '');
  const devName = process.env.APP_DB_NAME ?? 'healthmind';
  if (!name.endsWith('_test') || name === devName) {
    throw new Error(
      `Testes destrutivos só rodam no banco de testes (nome terminado em _test); recebido: ${name}. ` +
        'Configure TEST_DATABASE_URL e TEST_MIGRATION_DATABASE_URL (docs/runbooks/LOCAL_DEV.md).',
    );
  }
}

/**
 * Aponta este processo (e os filhos) para o banco de testes: copia `TEST_DATABASE_URL`,
 * `TEST_MIGRATION_DATABASE_URL` e `TEST_WORKER_DATABASE_URL` para as variáveis que o código lê, e confere as
 * três com a trava acima.
 * Chamado pelo setup do `test:db` e pela configuração do Playwright, antes de qualquer conexão.
 */
export function pointToTestDatabase(): void {
  const user = process.env.TEST_DATABASE_URL;
  const migrator = process.env.TEST_MIGRATION_DATABASE_URL;
  if (!user || !migrator) {
    throw new Error(
      'Defina TEST_DATABASE_URL e TEST_MIGRATION_DATABASE_URL no .env (banco healthmind_test; ' +
        'ver docs/runbooks/LOCAL_DEV.md).',
    );
  }
  assertDisposableDatabase(user);
  assertDisposableDatabase(migrator);
  if (databaseName(user) !== databaseName(migrator)) {
    throw new Error(
      'TEST_DATABASE_URL e TEST_MIGRATION_DATABASE_URL apontam para bancos diferentes.',
    );
  }
  process.env.DATABASE_URL = user;
  process.env.MIGRATION_DATABASE_URL = migrator;
  // Jobs em segundo plano (ADR-0037): papel app_worker no mesmo banco de testes.
  const worker = process.env.TEST_WORKER_DATABASE_URL;
  if (!worker) {
    throw new Error('Defina TEST_WORKER_DATABASE_URL no .env (papel app_worker; LOCAL_DEV.md).');
  }
  assertDisposableDatabase(worker);
  if (databaseName(worker) !== databaseName(user)) {
    throw new Error('TEST_WORKER_DATABASE_URL aponta para outro banco.');
  }
  process.env.WORKER_DATABASE_URL = worker;
}
