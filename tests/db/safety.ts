/**
 * Trava dos testes que APAGAM dados (test:db, e2e): só rodam contra banco local ou na CI, e nunca com
 * APP_ENV=production (CLAUDE.md regra 6).
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db']);

export function assertDisposableDatabase(url: string | undefined): void {
  if (!url) throw new Error('MIGRATION_DATABASE_URL não definido.');
  if (process.env.APP_ENV === 'production') {
    throw new Error('Testes destrutivos recusados com APP_ENV=production.');
  }
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host) && !process.env.CI) {
    throw new Error(`Testes destrutivos só rodam contra banco local (host atual: ${host}).`);
  }
}
