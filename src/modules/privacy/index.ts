/**
 * Módulo `privacy` (ADR-0019): Central de Privacidade, pedidos do titular, encerramento de conta de menor,
 * retenção (AccessLog, provas) e eliminação agendada dos dados de saúde. API pública.
 * Integração com o Next: `@/modules/privacy/server`. Jobs: `@/modules/privacy/jobs`.
 * Módulos com dados de saúde registram o eliminador em `@/modules/privacy/health-data`.
 */
// Só constantes e tipos: este arquivo é importado também por componentes cliente.
export { SUBPROCESSORS, type SubprocessorKey } from './subprocessors';
export type { PrivacyRequestKind, PrivacyRequestStatus, PrivacyRequestSummary } from './service';
