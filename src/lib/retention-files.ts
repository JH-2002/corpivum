import { z } from 'zod';
import { BRAZIL_REGIONS } from './env';
import { retentionViolations, type RetentionPolicy } from './retention';

/**
 * Checagem da CI (`pnpm check:retention`, ADR-0035): a política do `.env.example` (os valores que vão para os
 * ambientes) e a política de backup declarada em `infra/retention.json` (a que a Fase 7 confere no provedor).
 * Funções puras; o script só lê os arquivos.
 */

/** Padrões do `parseEnv` para variáveis ausentes ou vazias no `.env.example`. */
const DEFAULTS: RetentionPolicy = {
  PURGE_DAYS: 30,
  BACKUP_RETENTION_DAYS: 30,
  ACCESS_LOG_RETENTION_DAYS: 180,
  EXPORT_LINK_HOURS: 24,
  PROOF_RETENTION_DAYS: 1825,
};

/** `CHAVE=valor` por linha; ignora comentários e linhas em branco. */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

export function policyFromDotenv(vars: Record<string, string>): RetentionPolicy {
  const pick = (key: keyof RetentionPolicy) => {
    const value = vars[key];
    return value === undefined || value === '' ? DEFAULTS[key] : Number(value);
  };
  return {
    PURGE_DAYS: pick('PURGE_DAYS'),
    BACKUP_RETENTION_DAYS: pick('BACKUP_RETENTION_DAYS'),
    ACCESS_LOG_RETENTION_DAYS: pick('ACCESS_LOG_RETENTION_DAYS'),
    EXPORT_LINK_HOURS: pick('EXPORT_LINK_HOURS'),
    PROOF_RETENTION_DAYS: pick('PROOF_RETENTION_DAYS'),
  };
}

const days = z.number().int().positive();
export const infraRetentionSchema = z.object({
  version: z.literal(1),
  backup: z.object({
    retentionDays: days,
    encrypted: z.boolean(),
    regions: z.array(z.string()).min(1),
    pointInTimeRecoveryDays: days,
  }),
  /** Regra de ciclo de vida no prefixo `exports/` do storage: rede de segurança do `reports.expire` (OI-35). */
  storage: z.object({ exportsLifecycleDays: days }),
});

/** Motivos de falha (vazio = ok). Só nomes e regras, nunca segredos. */
export function checkRetentionFiles(envExample: string, infraJson: string): string[] {
  const policy = policyFromDotenv(parseDotenv(envExample));
  const out = retentionViolations(policy).map((v) => `.env.example: ${v}`);

  let raw: unknown;
  try {
    raw = JSON.parse(infraJson);
  } catch {
    return [...out, 'infra/retention.json: JSON inválido'];
  }
  const parsed = infraRetentionSchema.safeParse(raw);
  if (!parsed.success) {
    return [
      ...out,
      ...parsed.error.issues.map((i) => `infra/retention.json: ${i.path.join('.')}: ${i.message}`),
    ];
  }
  const { backup, storage } = parsed.data;
  // LEG-S07: o backup do provedor não pode durar mais que a purga, e o ambiente declara o mesmo valor.
  if (backup.retentionDays > policy.PURGE_DAYS) {
    out.push('infra/retention.json: backup.retentionDays deve ser ≤ PURGE_DAYS (LEG-S07)');
  }
  if (backup.retentionDays !== policy.BACKUP_RETENTION_DAYS) {
    out.push('infra/retention.json: backup.retentionDays deve ser igual a BACKUP_RETENTION_DAYS');
  }
  // A recuperação a um ponto no tempo também é cópia: fica dentro da retenção dos backups.
  if (backup.pointInTimeRecoveryDays > backup.retentionDays) {
    out.push(
      'infra/retention.json: backup.pointInTimeRecoveryDays deve ser ≤ backup.retentionDays',
    );
  }
  if (!backup.encrypted) out.push('infra/retention.json: backup.encrypted deve ser true (LEG-S07)');
  const outside = backup.regions.filter((r) => !(BRAZIL_REGIONS as readonly string[]).includes(r));
  if (outside.length > 0) {
    out.push(`infra/retention.json: região fora do Brasil: ${outside.join(', ')} (LEG-S10)`);
  }
  // O arquivo vive no máximo o link + 1 h (o job de hora em hora); a regra do provedor fica acima disso, para
  // não apagar antes do link vencer, e nunca além da purga.
  const minLifecycleDays = Math.ceil((policy.EXPORT_LINK_HOURS + 1) / 24);
  if (storage.exportsLifecycleDays < minLifecycleDays) {
    out.push(
      `infra/retention.json: storage.exportsLifecycleDays deve ser ≥ ${minLifecycleDays} (link + 1 h)`,
    );
  }
  if (storage.exportsLifecycleDays > policy.PURGE_DAYS) {
    out.push('infra/retention.json: storage.exportsLifecycleDays deve ser ≤ PURGE_DAYS');
  }
  return out;
}
