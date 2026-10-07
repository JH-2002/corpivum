/**
 * Eliminação agendada dos dados de saúde após a revogação (ADR-0019). Constantes compartilhadas entre o
 * serviço de consentimento (agenda/cancela) e o módulo `privacy` (executa).
 */
export const HEALTH_ELIMINATION_JOB = 'privacy.health_data_eliminate';

/** Uma eliminação agendada por pessoa: reconsentir cancela pela chave. */
export function healthEliminationKey(userId: string): string {
  return `health-eliminate:${userId}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function healthPurgeDate(revokedAt: Date, graceDays: number): Date {
  return new Date(revokedAt.getTime() + graceDays * DAY_MS);
}

/** Situação do consentimento de dados de saúde, para as telas dos módulos. */
export type HealthConsentState =
  { status: 'active' } | { status: 'missing' } | { status: 'revoked'; purgeAt: Date };
