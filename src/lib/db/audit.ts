import type { Tx } from './rls';

/**
 * Trilha de auditoria (LEG-S06): quem, quando e qual recurso. SEM conteúdo — só enums e IDs; a tabela não
 * tem coluna de texto livre. Grava via `app.audit_append` na MESMA transação da mudança auditada (contexto
 * `app.user_id` obrigatório). `system`: ação feita por job em nome do titular (sem ator humano).
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
  | 'data_export_deleted';

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
  options: { system?: boolean } = {},
): Promise<void> {
  await tx.$executeRaw`SELECT app.audit_append(${action}::public.audit_action,
    ${resourceType}::public.audit_resource_type, ${resourceId}::uuid, ${options.system ?? false})`;
}
