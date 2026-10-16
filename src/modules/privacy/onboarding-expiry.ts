/**
 * Prazos das contas que não concluem o onboarding (P7-M2, ADR-0037). Fixos na função do banco
 * (`app.onboarding_expiry_notices_due`, `app.onboarding_expired_purge`); aqui só para os textos. Sem
 * dependência de runtime.
 */
export const ONBOARDING_EXPIRY_DAYS = 30;
export const ONBOARDING_EXPIRY_NOTICE_DAYS = 7;
