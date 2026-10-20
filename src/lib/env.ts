import path from 'node:path';
import { z } from 'zod';
import { isDemoOnly } from './demo-mode';
import { EnvValidationError, NotEnabledError } from './errors';
import { RETENTION_LIMITS } from './retention';

const days = z.coerce.number().int().positive();

/** Regiões aceitas em produção: todas no Brasil (LEG-S10). Incluir nova região exige registro em DECISIONS. */
export const BRAZIL_REGIONS = ['gru1', 'sa-east-1', 'brazilsouth', 'southamerica-east1'] as const;

/** Papéis que nunca podem ser usados pelo runtime web (LEG-S03). */
const FORBIDDEN_RUNTIME_DB_USERS = [
  'app_migrator',
  'app_operator',
  'app_worker',
  'app_backup',
  'postgres',
];
/** Papéis de login de quem atende pedidos fora do app (ADR-0037): nunca no runtime. */
const OPERATOR_LOGIN_ROLE = /^operador_/;

function dbUser(url: string): string {
  try {
    return decodeURIComponent(new URL(url).username);
  } catch {
    return '';
  }
}

/** Nome do cabeçalho de IP escrito pela hospedagem. Também usado pelo ambiente do modo só demo (ADR-0043). */
export const clientIpHeaderSchema = z
  .string()
  .regex(/^[a-z0-9-]{1,64}$/)
  .refine((h) => h !== 'x-forwarded-for', 'x-forwarded-for é controlado pelo cliente');

export const envSchema = z
  .object({
    // Obrigatório e sem padrão: esquecer de defini-lo não pode cair em "development" (ADR-0007).
    APP_ENV: z.enum(['development', 'test', 'production']),
    APP_REGION: z.string().min(1),
    DATABASE_URL: z.url(),
    MIGRATION_DATABASE_URL: z.url().optional(),
    /**
     * Jobs em segundo plano (ADR-0036 D5, ADR-0037): papel `app_worker`, o único que executa varreduras,
     * expurgos, a fila e a purga de conta. Obrigatório onde a fila é consumida (fila em memória ou
     * JOB_WORKER=inline); instâncias web com JOB_WORKER=off não usam.
     */
    WORKER_DATABASE_URL: z.url().optional(),
    /** Só para `pnpm privacy:requests` (papel app_operator, ADR-0034). Recusada no runtime de produção. */
    OPERATOR_DATABASE_URL: z.url().optional(),
    /** Só para `pnpm backup:*` (papel app_backup e chave dos arquivos, ADR-0040). Recusadas no runtime de produção. */
    BACKUP_DATABASE_URL: z.url().optional(),
    BACKUP_ENCRYPTION_KEY: z.string().optional(),
    /** Base dos links enviados por e-mail (verificação, redefinição). https obrigatório em produção. */
    APP_URL: z.url(),
    /** Segredos de auth (ADR-0014), 32+ bytes em base64. Assina os cookies do fluxo e o de aparelho conhecido. */
    SESSION_SECRET: z.string(),
    /** Pepper das chaves HMAC de limite de tentativas (IP/e-mail nunca em claro). */
    RATE_LIMIT_SECRET: z.string(),
    /**
     * Pepper dos códigos de recuperação do MFA (PR1a-B3, ADR-0037): segredo próprio, para girar o
     * `SESSION_SECRET` sem invalidar os códigos de quem tem MFA.
     */
    RECOVERY_CODE_PEPPER: z.string(),
    /**
     * Cabeçalho com o IP do cliente escrito pela hospedagem (ex.: x-real-ip). Obrigatório em produção.
     * `x-forwarded-for` é recusado (PR1a-R2-B3): o 1º valor vem do cliente onde a hospedagem só acrescenta.
     */
    CLIENT_IP_HEADER: clientIpHeaderSchema.optional(),

    PURGE_DAYS: days.default(30),
    // LEG-R02: teto de 6 meses; só sobe por decisão registrada (OPEN_ISSUES OI-06).
    ACCESS_LOG_RETENTION_DAYS: days.max(RETENTION_LIMITS.accessLogMaxDays).default(180),
    BACKUP_RETENTION_DAYS: days.default(30),
    /**
     * Prazo entre revogar o consentimento de dados de saúde e eliminá-los (ADR-0019). Reconsentir antes
     * cancela a eliminação. `LEGAL-REVIEW` (OPEN_ISSUES OI-16). O valor está escrito no texto do
     * consentimento: precisa ser igual a HEALTH_DATA_GRACE_DAYS_IN_TEXT (o serviço recusa iniciar se não for);
     * mudá-lo exige nova versão do texto (PolicyVersion).
     */
    HEALTH_DATA_GRACE_DAYS: days.max(90).default(30),
    /** Retenção das provas de consentimento e de pedidos (LEG-R03). `LEGAL-REVIEW` (OI-04). Mínimo 1 ano. */
    PROOF_RETENTION_DAYS: days.min(RETENTION_LIMITS.proofMinDays).default(1825),
    /** Validade do link de download da exportação e dos relatórios: teto de 24 h (LEG-D03, ADR-0032). */
    EXPORT_LINK_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(RETENTION_LIMITS.exportLinkMaxHours)
      .default(24),

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
    /** Ferramenta de erros (ADR-0038): `console` (log filtrado) ou `memory` (só testes). */
    ERROR_REPORTER: z.enum(['console', 'memory']).default('console'),
  })
  .superRefine((env, ctx) => {
    const issue = (key: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [key], message });

    // LEG-S07 / LEG-D04: backups não podem sobreviver ao prazo de purga.
    if (env.BACKUP_RETENTION_DAYS > env.PURGE_DAYS) {
      issue('BACKUP_RETENTION_DAYS', 'deve ser menor ou igual a PURGE_DAYS (LEG-S07)');
    }

    // LEG-S03: o runtime conecta como app_user, nunca como dono das tabelas ou superusuário.
    const runtimeUser = dbUser(env.DATABASE_URL);
    if (FORBIDDEN_RUNTIME_DB_USERS.includes(runtimeUser) || OPERATOR_LOGIN_ROLE.test(runtimeUser)) {
      issue('DATABASE_URL', 'o runtime deve usar o papel app_user (LEG-S03)');
    }
    // Os jobs conectam como app_worker; quem consome a fila precisa da credencial (ADR-0037).
    if (env.WORKER_DATABASE_URL) {
      if (dbUser(env.WORKER_DATABASE_URL) !== 'app_worker') {
        issue('WORKER_DATABASE_URL', 'os jobs devem usar o papel app_worker (LEG-S03)');
      }
    } else if (env.JOB_QUEUE === 'memory' || env.JOB_WORKER === 'inline') {
      issue('WORKER_DATABASE_URL', 'obrigatório onde a fila é consumida (JOB_WORKER=inline)');
    }
    // Revisão M1 da 7b: a instância web (JOB_WORKER=off) nunca leva a credencial dos jobs em produção. A
    // separação do D5 só vale por inteiro com o worker dedicado (OI-14 a, CHECKLIST_GO_LIVE).
    if (env.APP_ENV === 'production' && env.JOB_WORKER === 'off' && env.WORKER_DATABASE_URL) {
      issue(
        'WORKER_DATABASE_URL',
        'a instância web (JOB_WORKER=off) não usa a credencial dos jobs',
      );
    }

    for (const key of ['SESSION_SECRET', 'RATE_LIMIT_SECRET', 'RECOVERY_CODE_PEPPER'] as const) {
      if (Buffer.from(env[key], 'base64').length < 32) {
        issue(key, 'precisa ter pelo menos 32 bytes em base64');
      }
    }
    if (env.SESSION_SECRET === env.RATE_LIMIT_SECRET) {
      issue('RATE_LIMIT_SECRET', 'deve ser diferente de SESSION_SECRET');
    }
    if ([env.SESSION_SECRET, env.RATE_LIMIT_SECRET].includes(env.RECOVERY_CODE_PEPPER)) {
      issue('RECOVERY_CODE_PEPPER', 'deve ser diferente de SESSION_SECRET e de RATE_LIMIT_SECRET');
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
        ERROR_REPORTER: 'memory',
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
      // Nem a do atendimento manual (ADR-0034): o operador usa o script, nunca o app web.
      if (env.OPERATOR_DATABASE_URL) {
        issue('OPERATOR_DATABASE_URL', 'não deve estar definido no runtime de produção (LEG-S03)');
      }
      // Nem as dos backups (ADR-0040): ficam na máquina de quem opera, nunca na web nem no worker.
      if (env.BACKUP_DATABASE_URL) {
        issue('BACKUP_DATABASE_URL', 'não deve estar definido no runtime de produção (LEG-S03)');
      }
      if (env.BACKUP_ENCRYPTION_KEY) {
        issue('BACKUP_ENCRYPTION_KEY', 'não deve estar definida no runtime de produção (LEG-S07)');
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

/**
 * Ambiente do servidor, validado uma vez. Não importar em componentes de cliente. No modo só demo (ADR-0043)
 * o app completo não existe: banco, adaptadores e segredos ficam inacessíveis e qualquer caminho até eles falha.
 */
export function getEnv(): Env {
  if (isDemoOnly()) throw new NotEnabledError('app completo (modo só demo, ADR-0043)');
  cached ??= parseEnv(process.env);
  return cached;
}
