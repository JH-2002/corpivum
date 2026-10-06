/**
 * Envio de e-mail transacional. O provedor real entra em docs/privacy/SUBPROCESSORS.md (LEG-S10).
 * E-mails carregam só o necessário (link, código); nunca conteúdo de saúde, diário ou medicamentos.
 */
export type MailTemplateId =
  | 'email-verification'
  | 'password-reset'
  /** Cadastro tentado com e-mail já existente (anti-enumeração, ADR-0014). */
  | 'account-exists'
  | 'reminder'
  | 'export-ready'
  | 'privacy-request-received';

export interface MailMessage {
  to: string;
  template: MailTemplateId;
  /** Parâmetros do template (ex.: URL de verificação). Nunca registrados em log. */
  params: Readonly<Record<string, string>>;
}

export interface MailProvider {
  readonly id: string;
  send(message: MailMessage): Promise<{ id: string }>;
}
