/**
 * Módulo `consent` (ADR-0019): ConsentRecord por finalidade, versões de documentos, reconsentimento e o
 * guard de tratamento. API pública. Integração com o Next (guardas, serviço): `@/modules/consent/server`.
 * Guard de tratamento sem Next (jobs, outros serviços): `@/modules/consent/guard`.
 */
// Só constantes e tipos: este arquivo é importado também por componentes cliente.
export {
  AVAILABLE_PURPOSES,
  CONSENT_PURPOSES,
  CURRENT_VERSIONS,
  DOCUMENT_MESSAGES,
  PUBLISHED_AT,
  REQUIRED_DOCUMENTS,
  isAvailablePurpose,
  purposeDocument,
  type AvailablePurpose,
  type ConsentPurpose,
  type PolicyDocument,
  type PublishedDocument,
  type RequiredDocument,
} from './catalog';
export {
  HEALTH_ELIMINATION_JOB,
  healthEliminationKey,
  healthPurgeDate,
  type HealthConsentState,
} from './health';
export type { ConsentState, DocumentState, PurposeState } from './service';
