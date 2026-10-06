import { z } from 'zod';
import { EnvValidationError } from './errors';

const days = z.coerce.number().int().positive();

const envSchema = z
  .object({
    APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_REGION: z.string().min(1),
    DATABASE_URL: z.url(),
    MIGRATION_DATABASE_URL: z.url().optional(),

    PURGE_DAYS: days.default(30),
    ACCESS_LOG_RETENTION_DAYS: days.default(180),
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
    // LEG-S07 / LEG-D04: backups não podem sobreviver ao prazo de purga.
    if (env.BACKUP_RETENTION_DAYS > env.PURGE_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['BACKUP_RETENTION_DAYS'],
        message: 'deve ser menor ou igual a PURGE_DAYS (LEG-S07)',
      });
    }

    if (env.KMS_PROVIDER === 'local') {
      const key = env.KMS_LOCAL_MASTER_KEY ?? '';
      if (Buffer.from(key, 'base64').length !== 32) {
        ctx.addIssue({
          code: 'custom',
          path: ['KMS_LOCAL_MASTER_KEY'],
          message: 'precisa ter 32 bytes em base64',
        });
      }
    }

    // Implementações locais/fake nunca rodam em produção.
    if (env.APP_ENV === 'production') {
      const devOnly = {
        LLM_PROVIDER: 'fake',
        KMS_PROVIDER: 'local',
        STORAGE_PROVIDER: 'local',
        MAIL_PROVIDER: 'console',
        JOB_QUEUE: 'memory',
      } as const;
      for (const [key, value] of Object.entries(devOnly)) {
        if (env[key as keyof typeof devOnly] === value) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `"${value}" não é permitido em produção`,
          });
        }
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
