import { z } from 'zod';
import { BRAZIL_REGIONS, clientIpHeaderSchema } from './env';
import { EnvValidationError } from './errors';

/**
 * Credenciais e segredos do app completo. No modo só demo (ADR-0043) nenhum pode estar definido: a demo não
 * tem banco, sessão nem cifra, e a ausência deles garante que nenhum caminho alcance dado real.
 */
export const DEMO_FORBIDDEN_VARS = [
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'WORKER_DATABASE_URL',
  'OPERATOR_DATABASE_URL',
  'BACKUP_DATABASE_URL',
  'BACKUP_ENCRYPTION_KEY',
  'SESSION_SECRET',
  'RATE_LIMIT_SECRET',
  'RECOVERY_CODE_PEPPER',
  'KMS_LOCAL_MASTER_KEY',
] as const;

const demoEnvSchema = z
  .object({
    APP_ENV: z.enum(['development', 'test', 'production']),
    APP_URL: z.url(),
    APP_REGION: z.string().min(1).optional(),
    CLIENT_IP_HEADER: clientIpHeaderSchema.optional(),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== 'production') return;
    const issue = (key: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [key], message });
    if (!env.APP_URL.startsWith('https://'))
      issue('APP_URL', 'deve usar https em produção (LEG-S01)');
    // Sem cabeçalho confiável, o limite por IP do demo seria contornável (TM-03).
    if (!env.CLIENT_IP_HEADER) issue('CLIENT_IP_HEADER', 'obrigatório em produção (TM-03)');
    // Execução das funções no Brasil (LEG-S10, ADR-0043 D2).
    if (!(BRAZIL_REGIONS as readonly string[]).includes(env.APP_REGION ?? '')) {
      issue('APP_REGION', `deve ser uma região no Brasil: ${BRAZIL_REGIONS.join(', ')} (LEG-S10)`);
    }
  });

export type DemoEnv = z.infer<typeof demoEnvSchema>;

/** Valida o ambiente do modo só demo. Erros listam só nomes de variáveis e motivos, nunca valores. */
export function parseDemoEnv(source: Record<string, string | undefined>): DemoEnv {
  const issues: string[] = DEMO_FORBIDDEN_VARS.filter((key) => Boolean(source[key])).map(
    (key) => `${key}: não pode estar definida no modo só demo (ADR-0043)`,
  );
  const result = demoEnvSchema.safeParse(source);
  if (!result.success) {
    issues.push(...result.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`));
  }
  if (!result.success || issues.length > 0) throw new EnvValidationError(issues);
  return result.data;
}
