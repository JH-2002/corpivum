import { describe, expect, it } from 'vitest';
import { EnvValidationError } from './errors';
import { parseEnv } from './env';

const validKey = Buffer.alloc(32, 7).toString('base64');
const base = {
  APP_REGION: 'gru1',
  DATABASE_URL: 'postgresql://app_user:x@localhost:5432/healthmind',
  KMS_LOCAL_MASTER_KEY: validKey,
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

describe('parseEnv', () => {
  it('aplica os prazos padrão de retenção', () => {
    const env = parseEnv(base);
    expect(env.PURGE_DAYS).toBe(30);
    expect(env.ACCESS_LOG_RETENTION_DAYS).toBe(180);
    expect(env.BACKUP_RETENTION_DAYS).toBe(30);
  });

  it('falha se a retenção de backup exceder PURGE_DAYS (LEG-S07)', () => {
    const issues = issuesOf({ ...base, PURGE_DAYS: '30', BACKUP_RETENTION_DAYS: '35' });
    expect(issues.some((i) => i.startsWith('BACKUP_RETENTION_DAYS'))).toBe(true);
  });

  it('aceita retenção de backup igual ao prazo de purga', () => {
    expect(() =>
      parseEnv({ ...base, PURGE_DAYS: '20', BACKUP_RETENTION_DAYS: '20' }),
    ).not.toThrow();
  });

  it('exige chave KMS local de 32 bytes', () => {
    const issues = issuesOf({ ...base, KMS_LOCAL_MASTER_KEY: 'curta' });
    expect(issues.some((i) => i.startsWith('KMS_LOCAL_MASTER_KEY'))).toBe(true);
  });

  it('recusa adaptadores fake/local em produção', () => {
    const issues = issuesOf({ ...base, APP_ENV: 'production' });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('LLM_PROVIDER'),
        expect.stringContaining('KMS_PROVIDER'),
        expect.stringContaining('MAIL_PROVIDER'),
      ]),
    );
  });

  it('não expõe valores de variáveis na mensagem de erro', () => {
    const secret = 'postgresql://app_user:SENHA-SECRETA@host/db';
    try {
      parseEnv({ ...base, DATABASE_URL: secret, PURGE_DAYS: 'abc' });
    } catch (error) {
      expect(String(error)).not.toContain('SENHA-SECRETA');
    }
  });
});
