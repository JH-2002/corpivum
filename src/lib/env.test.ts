import { describe, expect, it } from 'vitest';
import { EnvValidationError } from './errors';
import { parseEnv } from './env';

const validKey = Buffer.alloc(32, 7).toString('base64');
const base = {
  APP_ENV: 'development',
  APP_REGION: 'gru1',
  DATABASE_URL: 'postgresql://app_user:x@localhost:5432/healthmind',
  KMS_LOCAL_MASTER_KEY: validKey,
  APP_URL: 'http://localhost:3000',
  SESSION_SECRET: Buffer.alloc(32, 1).toString('base64'),
  RATE_LIMIT_SECRET: Buffer.alloc(32, 2).toString('base64'),
};

function issuesOf(source: Record<string, string | undefined>): readonly string[] {
  try {
    parseEnv(source);
  } catch (error) {
    if (error instanceof EnvValidationError) return error.issues;
    throw error;
  }
  return [];
}

const hasIssue = (source: Record<string, string | undefined>, key: string) =>
  issuesOf(source).some((i) => i.startsWith(key));

describe('parseEnv', () => {
  it('aplica os prazos padrão de retenção', () => {
    const env = parseEnv(base);
    expect(env.PURGE_DAYS).toBe(30);
    expect(env.ACCESS_LOG_RETENTION_DAYS).toBe(180);
    expect(env.BACKUP_RETENTION_DAYS).toBe(30);
  });

  it('exige APP_ENV explícito (sem cair em development por omissão)', () => {
    expect(hasIssue({ ...base, APP_ENV: undefined }, 'APP_ENV')).toBe(true);
  });

  it('falha se a retenção de backup exceder PURGE_DAYS (LEG-S07)', () => {
    expect(
      hasIssue({ ...base, PURGE_DAYS: '30', BACKUP_RETENTION_DAYS: '35' }, 'BACKUP_RETENTION_DAYS'),
    ).toBe(true);
  });

  it('aceita retenção de backup igual ao prazo de purga', () => {
    expect(() =>
      parseEnv({ ...base, PURGE_DAYS: '20', BACKUP_RETENTION_DAYS: '20' }),
    ).not.toThrow();
  });

  it('limita ACCESS_LOG_RETENTION_DAYS a 180 dias (LEG-R02)', () => {
    expect(
      hasIssue({ ...base, ACCESS_LOG_RETENTION_DAYS: '365' }, 'ACCESS_LOG_RETENTION_DAYS'),
    ).toBe(true);
  });

  it('exige chave KMS local de 32 bytes', () => {
    expect(hasIssue({ ...base, KMS_LOCAL_MASTER_KEY: 'curta' }, 'KMS_LOCAL_MASTER_KEY')).toBe(true);
  });

  it.each(['app_migrator', 'postgres'])('recusa runtime conectando como %s (LEG-S03)', (user) => {
    expect(
      hasIssue({ ...base, DATABASE_URL: `postgresql://${user}:x@localhost/db` }, 'DATABASE_URL'),
    ).toBe(true);
  });

  it.each(['public', 'public/exports', './public'])(
    'recusa storage local em %s (LEG-D03)',
    (dir) => {
      expect(hasIssue({ ...base, STORAGE_LOCAL_DIR: dir }, 'STORAGE_LOCAL_DIR')).toBe(true);
    },
  );

  describe('produção', () => {
    const prod = { ...base, APP_ENV: 'production' };

    it('recusa adaptadores fake/local', () => {
      expect(issuesOf(prod)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('LLM_PROVIDER'),
          expect.stringContaining('KMS_PROVIDER'),
          expect.stringContaining('STORAGE_PROVIDER'),
          expect.stringContaining('MAIL_PROVIDER'),
          expect.stringContaining('JOB_QUEUE'),
        ]),
      );
    });

    it('recusa a credencial de migração no runtime (LEG-S03)', () => {
      expect(
        hasIssue(
          { ...prod, MIGRATION_DATABASE_URL: 'postgresql://app_migrator:x@h/db' },
          'MIGRATION_DATABASE_URL',
        ),
      ).toBe(true);
    });

    it('exige região no Brasil (LEG-S10)', () => {
      expect(hasIssue({ ...prod, APP_REGION: 'us-east-1' }, 'APP_REGION')).toBe(true);
      expect(hasIssue({ ...prod, APP_REGION: 'gru1' }, 'APP_REGION')).toBe(false);
    });
  });

  it('não expõe valores de variáveis na mensagem de erro', () => {
    const secret = 'postgresql://app_migrator:SENHA-SECRETA@host/db';
    let message = '';
    try {
      parseEnv({ ...base, DATABASE_URL: secret, PURGE_DAYS: 'abc' });
    } catch (error) {
      message = String(error);
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('SENHA-SECRETA');
  });

  it('exige segredos de auth com 32+ bytes e diferentes entre si (ADR-0014)', () => {
    expect(hasIssue({ ...base, SESSION_SECRET: 'curto' }, 'SESSION_SECRET')).toBe(true);
    expect(hasIssue({ ...base, RATE_LIMIT_SECRET: undefined }, 'RATE_LIMIT_SECRET')).toBe(true);
    expect(hasIssue({ ...base, RATE_LIMIT_SECRET: base.SESSION_SECRET }, 'RATE_LIMIT_SECRET')).toBe(
      true,
    );
  });

  it('exige CLIENT_IP_HEADER em produção (LEG-S05)', () => {
    expect(hasIssue({ ...base, APP_ENV: 'production' }, 'CLIENT_IP_HEADER')).toBe(true);
    expect(
      hasIssue(
        { ...base, APP_ENV: 'production', CLIENT_IP_HEADER: 'x-real-ip' },
        'CLIENT_IP_HEADER',
      ),
    ).toBe(false);
    expect(hasIssue({ ...base, CLIENT_IP_HEADER: 'X Bad' }, 'CLIENT_IP_HEADER')).toBe(true);
  });

  it('exige APP_URL com https em produção (LEG-S01)', () => {
    expect(hasIssue({ ...base, APP_ENV: 'production' }, 'APP_URL')).toBe(true);
    expect(
      hasIssue({ ...base, APP_ENV: 'production', APP_URL: 'https://app.exemplo.test' }, 'APP_URL'),
    ).toBe(false);
  });
});
