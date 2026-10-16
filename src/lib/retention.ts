/**
 * Política de retenção (ADR-0035; LEG-R01–R03, LEG-S07, LEG-D03, LEG-D04). Fonte única dos tetos usados pela
 * validação do ambiente (`parseEnv`), pelo início dos jobs (`startJobs`) e pela checagem da CI
 * (`pnpm check:retention`, que também confere `infra/retention.json`).
 *
 * A checagem repete o que o `parseEnv` já recusa, de propósito: é a segunda linha de defesa caso o esquema do
 * ambiente seja afrouxado por engano, e é o mesmo código que a CI roda sobre os arquivos declarativos.
 */
export const RETENTION_LIMITS = {
  /** LEG-R02: registros de acesso por até 6 meses; só sobe por decisão registrada (OI-06). */
  accessLogMaxDays: 180,
  /** LEG-D03: o link de download das exportações vale no máximo 24 h. */
  exportLinkMaxHours: 24,
  /** LEG-R03: provas por pelo menos 1 ano (OI-04). */
  proofMinDays: 365,
} as const;

export interface RetentionPolicy {
  PURGE_DAYS: number;
  BACKUP_RETENTION_DAYS: number;
  ACCESS_LOG_RETENTION_DAYS: number;
  EXPORT_LINK_HOURS: number;
  PROOF_RETENTION_DAYS: number;
}

/** Motivos da recusa: só nomes de variáveis e regras, nunca dados (LEG-R04). */
export function retentionViolations(policy: RetentionPolicy): string[] {
  const out: string[] = [];
  // LEG-S07 / LEG-D04: um backup não pode sobreviver ao prazo em que o dado já foi apagado da base.
  if (policy.BACKUP_RETENTION_DAYS > policy.PURGE_DAYS) {
    out.push('BACKUP_RETENTION_DAYS deve ser menor ou igual a PURGE_DAYS (LEG-S07)');
  }
  if (policy.EXPORT_LINK_HOURS > RETENTION_LIMITS.exportLinkMaxHours) {
    out.push(
      `EXPORT_LINK_HOURS deve ser no máximo ${RETENTION_LIMITS.exportLinkMaxHours} (LEG-D03)`,
    );
  }
  if (policy.ACCESS_LOG_RETENTION_DAYS > RETENTION_LIMITS.accessLogMaxDays) {
    out.push(
      `ACCESS_LOG_RETENTION_DAYS deve ser no máximo ${RETENTION_LIMITS.accessLogMaxDays} (LEG-R02)`,
    );
  }
  if (policy.PROOF_RETENTION_DAYS < RETENTION_LIMITS.proofMinDays) {
    out.push(`PROOF_RETENTION_DAYS deve ser no mínimo ${RETENTION_LIMITS.proofMinDays} (LEG-R03)`);
  }
  for (const key of [
    'PURGE_DAYS',
    'BACKUP_RETENTION_DAYS',
    'ACCESS_LOG_RETENTION_DAYS',
    'EXPORT_LINK_HOURS',
    'PROOF_RETENTION_DAYS',
  ] as const) {
    if (!Number.isInteger(policy[key]) || policy[key] <= 0) {
      out.push(`${key} deve ser um inteiro positivo`);
    }
  }
  return out;
}

export class RetentionPolicyError extends Error {
  readonly violations: string[];
  constructor(violations: string[]) {
    super(`Política de retenção inválida: ${violations.join('; ')}`);
    this.name = 'RetentionPolicyError';
    this.violations = violations;
  }
}

/** Falha se a política violar algum teto. Roda no início dos jobs e na CI. */
export function assertRetentionPolicy(policy: RetentionPolicy): void {
  const violations = retentionViolations(policy);
  if (violations.length > 0) throw new RetentionPolicyError(violations);
}
