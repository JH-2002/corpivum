import type { Tx } from './rls';

/**
 * Trilha de auditoria (LEG-S06): quem, quando e qual recurso. SEM conteúdo — só enums e IDs; a tabela não
 * tem coluna de texto livre. Grava via `app.audit_append` na MESMA transação da mudança auditada (contexto
 * `app.user_id` obrigatório). `system`: ação feita por job ou aviso automático em nome do titular (sem ator
 * humano), por `app.audit_append_system`, que só aceita a lista fechada de ações do sistema (PR1b-B2).
 * Os valores precisam existir nos enums `audit_action`/`audit_resource_type` do banco.
 */
export type AuditAction =
  | 'onboarding_completed'
  | 'policy_accepted'
  | 'policy_acknowledged'
  | 'consent_granted'
  | 'consent_revoked'
  | 'health_data_elimination_scheduled'
  | 'health_data_elimination_cancelled'
  | 'health_data_eliminated'
  | 'session_revoked'
  | 'privacy_request_created'
  | 'account_closed_minor'
  | 'data_export_requested'
  | 'data_export_downloaded'
  | 'data_export_deleted'
  | 'data_export_health_read'
  | 'privacy_request_closed'
  | 'privacy_request_contact_read'
  | 'account_deletion_requested'
  | 'account_deleted'
  | 'account_deletion_notice_sent'
  | 'account_purged'
  | 'onboarding_expiry_notice_sent'
  | 'account_expired_onboarding'
  | 'privacy_request_registered';

/** Ações aceitas por `app.audit_append_system` (lista igual à da função no banco). */
export type SystemAuditAction =
  'health_data_eliminated' | 'account_deletion_notice_sent' | 'data_export_health_read';

export type AuditResourceType =
  | 'user'
  | 'consent_record'
  | 'policy_version'
  | 'privacy_request'
  | 'session'
  | 'health_data'
  | 'data_export';

export async function auditAppend(
  tx: Tx,
  action: AuditAction,
  resourceType: AuditResourceType,
  resourceId: string | null = null,
): Promise<void> {
  await tx.$executeRaw`SELECT app.audit_append(${action}::public.audit_action,
    ${resourceType}::public.audit_resource_type, ${resourceId}::uuid)`;
}

export async function auditAppendSystem(
  tx: Tx,
  action: SystemAuditAction,
  resourceType: AuditResourceType,
  resourceId: string | null = null,
): Promise<void> {
  await tx.$executeRaw`SELECT app.audit_append_system(${action}::public.audit_action,
    ${resourceType}::public.audit_resource_type, ${resourceId}::uuid)`;
}
