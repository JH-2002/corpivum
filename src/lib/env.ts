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
    /** Base dos links enviados por e-mail (verificação, redefinição). https obrigatório em produção. */
    APP_URL: z.url(),
    /** Segredos de auth (ADR-0014), 32+ bytes em base64. Cookies do fluxo e pepper dos códigos de recuperação. */
    SESSION_SECRET: z.string(),
    /** Pepper das chaves HMAC de limite de tentativas (IP/e-mail nunca em claro). */
    RATE_LIMIT_SECRET: z.string(),
    /** Cabeçalho com o IP do cliente escrito pela hospedagem (ex.: x-real-ip). Obrigatório em produção. */
    CLIENT_IP_HEADER: z
      .string()
      .regex(/^[a-z0-9-]{1,64}$/)
      .optional(),

    PURGE_DAYS: days.default(30),
    // LEG-R02: teto de 6 meses; só sobe por decisão registrada (OPEN_ISSUES OI-06).
    ACCESS_LOG_RETENTION_DAYS: days.max(180).default(180),
    BACKUP_RETENTION_DAYS: days.default(30),
    /**
     * Prazo entre revogar o consentimento de dados de saúde e eliminá-los (ADR-0019). Reconsentir antes
     * cancela a eliminação. `LEGAL-REVIEW` (OPEN_ISSUES OI-16). O valor está escrito no texto do
     * consentimento: precisa ser igual a HEALTH_DATA_GRACE_DAYS_IN_TEXT (o serviço recusa iniciar se não for);
     * mudá-lo exige nova versão do texto (PolicyVersion).
     */
    HEALTH_DATA_GRACE_DAYS: days.max(90).default(30),
    /** Retenção das provas de consentimento e de pedidos (LEG-R03). `LEGAL-REVIEW` (OI-04). Mínimo 1 ano. */
    PROOF_RETENTION_DAYS: days.min(365).default(1825),

    KMS_PROVIDER: z.enum(['local']).default('local'),
    KMS_LOCAL_MASTER_KEY: z.string().optional(),
    STORAGE_PROVIDER: z.enum(['local']).default('local'),
    STORAGE_LOCAL_DIR: z.string().min(1).default('.storage'),
    MAIL_PROVIDER: z.enum(['console']).default('console'),
    /**
     * Só em APP_ENV=development: o provedor `console` entrega via SMTP ao Mailpit local
     * (docker-compose), para ler os links de verificação. Só aceita host local.
     */
    DEV_SMTP_HOST: z.enum(['localhost', '127.0.0.1', '::1', 'mailpit']).default('localhost'),
    DEV_SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    /** Fila de jobs: `postgres` (ADR-0019, OI-14) ou `memory` (só dev/test). */
    JOB_QUEUE: z.enum(['memory', 'postgres']).default('memory'),
    /** `inline`: esta instância também consome a fila. `off`: só enfileira (worker em processo separado). */
    JOB_WORKER: z.enum(['inline', 'off']).default('inline'),
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

    for (const key of ['SESSION_SECRET', 'RATE_LIMIT_SECRET'] as const) {
      if (Buffer.from(env[key], 'base64').length < 32) {
        issue(key, 'precisa ter pelo menos 32 bytes em base64');
      }
    }
    if (env.SESSION_SECRET === env.RATE_LIMIT_SECRET) {
      issue('RATE_LIMIT_SECRET', 'deve ser diferente de SESSION_SECRET');
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
      // LEG-S05: sem cabeçalho confiável, o limite por IP seria contornável.
      if (!env.CLIENT_IP_HEADER) {
        issue('CLIENT_IP_HEADER', 'obrigatório em produção (IP confiável para limites, LEG-S05)');
      }
      if (!env.APP_URL.startsWith('https://')) {
        issue('APP_URL', 'deve usar https em produção (LEG-S01)');
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
