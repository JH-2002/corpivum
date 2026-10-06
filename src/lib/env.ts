import path from 'node:path';
import { z } from 'zod';
import { EnvValidationError } from './errors';

const days = z.coerce.number().int().positive();

/** Regiões aceitas em produção: todas no Brasil (LEG-S10). Incluir nova região exige registro em DECISIONS. */
export const BRAZIL_REGIONS = ['gru1', 'sa-east-1', 'brazilsouth', 'southamerica-east1'] as const;

/** Papéis que nunca podem ser usados pelo runtime (LEG-S03). */
const FORBIDDEN_RUNTIME_DB_USERS = ['app_migrator', 'postgres'];

function dbUser(url: string): string {
  try {
    return decodeURIComponent(new URL(url).username);
  } catch {
    return '';
  }
}

const envSchema = z
  .object({
    // Obrigatório e sem padrão: esquecer de defini-lo não pode cair em "development" (ADR-0007).
    APP_ENV: z.enum(['development', 'test', 'production']),
    APP_REGION: z.string().min(1),
    DATABASE_URL: z.url(),
    MIGRATION_DATABASE_URL: z.url().optional(),

    PURGE_DAYS: days.default(30),
    // LEG-R02: teto de 6 meses; só sobe por decisão registrada (OPEN_ISSUES OI-06).
    ACCESS_LOG_RETENTION_DAYS: days.max(180).default(180),
    BACKUP_RETENTION_DAYS: days.default(30),

    LLM_PROVIDER: z.enum(['fake']).default('fake'),
    KMS_PROVIDER: z.enum(['local']).default('local'),
    KMS_LOCAL_MASTER_KEY: z.string().optional(),
    STORAGE_PROVIDER: z.enum(['local']).default('local'),
    STORAGE_LOCAL_DIR: z.string().min(1).default('.storage'),
    MAIL_PROVIDER: z.enum(['console']).default('console'),
    JOB_QUEUE: z.enum(['memory']).default('memory'),
    AGE_SIGNAL_PROVIDER: z.enum(['none']).default('none'),
    WEARABLE_PROVIDER: z.enum(['disabled']).default('disabled'),
  })
  .superRefine((env, ctx) => {
    const issue = (key: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [key], message });

    // LEG-S07 / LEG-D04: backups não podem sobreviver ao prazo de purga.
    if (env.BACKUP_RETENTION_DAYS > env.PURGE_DAYS) {
      issue('BACKUP_RETENTION_DAYS', 'deve ser menor ou igual a PURGE_DAYS (LEG-S07)');
    }

    // LEG-S03: o runtime conecta como app_user, nunca como dono das tabelas ou superusuário.
    if (FORBIDDEN_RUNTIME_DB_USERS.includes(dbUser(env.DATABASE_URL))) {
      issue('DATABASE_URL', 'o runtime deve usar o papel app_user (LEG-S03)');
    }

    if (env.KMS_PROVIDER === 'local') {
      const key = env.KMS_LOCAL_MASTER_KEY ?? '';
      if (Buffer.from(key, 'base64').length !== 32) {
        issue('KMS_LOCAL_MASTER_KEY', 'precisa ter 32 bytes em base64');
      }
    }

    // LEG-D03: o storage local nunca pode ficar dentro de public/, que o Next serve sem autenticação.
    const storageDir = path.resolve(env.STORAGE_LOCAL_DIR);
    const publicDir = path.resolve('public');
    if (storageDir === publicDir || storageDir.startsWith(publicDir + path.sep)) {
      issue('STORAGE_LOCAL_DIR', 'não pode ficar dentro de public/ (LEG-D03)');
    }

    if (env.APP_ENV === 'production') {
      // Implementações locais/fake nunca rodam em produção.
      const devOnly = {
        LLM_PROVIDER: 'fake',
        KMS_PROVIDER: 'local',
        STORAGE_PROVIDER: 'local',
        MAIL_PROVIDER: 'console',
        JOB_QUEUE: 'memory',
      } as const;
      for (const [key, value] of Object.entries(devOnly)) {
        if (env[key as keyof typeof devOnly] === value) {
          issue(key, `"${value}" não é permitido em produção`);
        }
      }
      // A credencial de migração não fica disponível ao runtime de produção (LEG-S03).
      if (env.MIGRATION_DATABASE_URL) {
        issue('MIGRATION_DATABASE_URL', 'não deve estar definido no runtime de produção (LEG-S03)');
      }
      // LEG-S10: execução no Brasil.
      if (!(BRAZIL_REGIONS as readonly string[]).includes(env.APP_REGION)) {
        issue(
          'APP_REGION',
          `deve ser uma região no Brasil: ${BRAZIL_REGIONS.join(', ')} (LEG-S10)`,
        );
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Valida um objeto de ambiente. Erros listam apenas nomes de variáveis e motivos, nunca valores. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`),
    );
  }
  return result.data;
}

let cached: Env | undefined;

/** Ambiente do servidor, validado uma vez. Não importar em componentes de cliente. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
