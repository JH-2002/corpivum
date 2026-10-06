/**
 * Módulo `auth` (ADR-0014): conta, sessões em banco, MFA, limites de tentativa e age gate 18+.
 * API pública do módulo. Outros módulos não importam arquivos internos.
 * Integração com o Next (cookies, guards): `@/modules/auth/server` (somente servidor).
 */
// Só constantes e tipos: este arquivo é importado também por componentes cliente.
export { PASSWORD_MAX, PASSWORD_MIN, RECOVERY_CODE_COUNT } from './constants';
export type { PasswordProblem } from './password';
export type { ResolvedSession, SessionSummary } from './service';
