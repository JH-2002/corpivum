import { assertDisposableDatabase, assertLocalDatabase, pointToTestDatabase } from '../db/safety';

/** ADR-0024: testes destrutivos nunca alcançam o banco de desenvolvimento. */
describe('trava do banco de testes', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('recusa o banco de desenvolvimento e qualquer nome sem _test', () => {
    process.env.APP_DB_NAME = 'healthmind';
    expect(() => assertDisposableDatabase('postgresql://u:p@localhost:5432/healthmind')).toThrow(
      /banco de testes/,
    );
    expect(() => assertDisposableDatabase('postgresql://u:p@localhost:5432/outro')).toThrow();
    expect(() =>
      assertDisposableDatabase('postgresql://u:p@localhost:5432/healthmind_test'),
    ).not.toThrow();
  });

  it('recusa host remoto fora da CI e qualquer banco com APP_ENV=production', () => {
    delete process.env.CI;
    expect(() => assertLocalDatabase('postgresql://u:p@db.exemplo.com:5432/x_test')).toThrow();
    process.env.APP_ENV = 'production';
    expect(() => assertLocalDatabase('postgresql://u:p@localhost:5432/x_test')).toThrow();
  });

  it('pointToTestDatabase troca as URLs só se as duas forem do banco de testes', () => {
    process.env.APP_DB_NAME = 'healthmind';
    process.env.DATABASE_URL = 'postgresql://app_user:p@localhost:5432/healthmind';
    process.env.TEST_DATABASE_URL = 'postgresql://app_user:p@localhost:5432/healthmind';
    process.env.TEST_MIGRATION_DATABASE_URL =
      'postgresql://app_migrator:p@localhost:5432/healthmind';
    expect(() => pointToTestDatabase()).toThrow();
    expect(process.env.DATABASE_URL).toContain('/healthmind');

    process.env.TEST_DATABASE_URL = 'postgresql://app_user:p@localhost:5432/healthmind_test';
    process.env.TEST_MIGRATION_DATABASE_URL =
      'postgresql://app_migrator:p@localhost:5432/healthmind_test';
    process.env.TEST_WORKER_DATABASE_URL = 'postgresql://app_worker:p@localhost:5432/healthmind';
    expect(() => pointToTestDatabase()).toThrow();
    process.env.TEST_WORKER_DATABASE_URL =
      'postgresql://app_worker:p@localhost:5432/healthmind_test';
    process.env.TEST_BACKUP_DATABASE_URL = 'postgresql://app_backup:p@localhost:5432/healthmind';
    expect(() => pointToTestDatabase()).toThrow();
    process.env.TEST_BACKUP_DATABASE_URL =
      'postgresql://app_backup:p@localhost:5432/healthmind_test';
    pointToTestDatabase();
    expect(process.env.WORKER_DATABASE_URL).toMatch(/\/healthmind_test$/);
    expect(process.env.BACKUP_DATABASE_URL).toMatch(/\/healthmind_test$/);
    expect(process.env.DATABASE_URL).toMatch(/\/healthmind_test$/);
    expect(process.env.MIGRATION_DATABASE_URL).toMatch(/\/healthmind_test$/);

    delete process.env.TEST_DATABASE_URL;
    expect(() => pointToTestDatabase()).toThrow(/TEST_DATABASE_URL/);
  });
});
