import { readFileSync } from 'node:fs';
import { assertRetentionPolicy, RetentionPolicyError, retentionViolations } from './retention';
import { checkRetentionFiles, parseDotenv, policyFromDotenv } from './retention-files';

const ok = {
  PURGE_DAYS: 30,
  BACKUP_RETENTION_DAYS: 30,
  ACCESS_LOG_RETENTION_DAYS: 180,
  EXPORT_LINK_HOURS: 24,
};

const infra = (backup: Record<string, unknown> = {}, storage: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    backup: {
      retentionDays: 30,
      encrypted: true,
      regions: ['sa-east-1'],
      pointInTimeRecoveryDays: 7,
      ...backup,
    },
    storage: { exportsLifecycleDays: 2, ...storage },
  });

describe('assertRetentionPolicy (ADR-0035)', () => {
  it('aceita a política padrão', () => {
    expect(() => assertRetentionPolicy(ok)).not.toThrow();
  });

  it.each([
    [{ BACKUP_RETENTION_DAYS: 31 }, 'BACKUP_RETENTION_DAYS'],
    [{ EXPORT_LINK_HOURS: 25 }, 'EXPORT_LINK_HOURS'],
    [{ ACCESS_LOG_RETENTION_DAYS: 181 }, 'ACCESS_LOG_RETENTION_DAYS'],
    [{ PURGE_DAYS: 0, BACKUP_RETENTION_DAYS: 0 }, 'PURGE_DAYS'],
  ])('recusa %o', (change, key) => {
    const policy = { ...ok, ...change };
    expect(() => assertRetentionPolicy(policy)).toThrow(RetentionPolicyError);
    expect(retentionViolations(policy).join(' ')).toContain(key);
  });
});

describe('check:retention', () => {
  it('lê o .env.example com os padrões para valores vazios', () => {
    const vars = parseDotenv('# c\nPURGE_DAYS=20\n\nBACKUP_RETENTION_DAYS=\nX=a=b\n');
    expect(vars).toMatchObject({ PURGE_DAYS: '20', BACKUP_RETENTION_DAYS: '', X: 'a=b' });
    expect(policyFromDotenv(vars)).toEqual({ ...ok, PURGE_DAYS: 20 });
  });

  it('os arquivos do repositório estão dentro da política', () => {
    expect(
      checkRetentionFiles(
        readFileSync('.env.example', 'utf8'),
        readFileSync('infra/retention.json', 'utf8'),
      ),
    ).toEqual([]);
  });

  it.each([
    [{ retentionDays: 45 }, 'PURGE_DAYS'],
    [{ retentionDays: 20 }, 'igual a BACKUP_RETENTION_DAYS'],
    [{ pointInTimeRecoveryDays: 31 }, 'pointInTimeRecoveryDays'],
    [{ encrypted: false }, 'encrypted'],
    [{ regions: ['us-east-1'] }, 'fora do Brasil'],
  ])('recusa backup %o', (backup, reason) => {
    const env = 'PURGE_DAYS=30\nBACKUP_RETENTION_DAYS=30\n';
    expect(checkRetentionFiles(env, infra(backup)).join(' ')).toContain(reason);
  });

  it('recusa ciclo de vida das exportações mais curto que o link ou além da purga', () => {
    const env = 'PURGE_DAYS=30\nBACKUP_RETENTION_DAYS=30\nEXPORT_LINK_HOURS=24\n';
    expect(checkRetentionFiles(env, infra({}, { exportsLifecycleDays: 1 })).join(' ')).toContain(
      'exportsLifecycleDays deve ser ≥ 2',
    );
    expect(checkRetentionFiles(env, infra({}, { exportsLifecycleDays: 31 })).join(' ')).toContain(
      'PURGE_DAYS',
    );
    expect(checkRetentionFiles(env, infra())).toEqual([]);
  });

  it('recusa .env.example com backup acima da purga e JSON inválido', () => {
    expect(checkRetentionFiles('PURGE_DAYS=10\n', infra()).join(' ')).toContain('LEG-S07');
    expect(checkRetentionFiles('', '{')).toEqual(['infra/retention.json: JSON inválido']);
  });
});
