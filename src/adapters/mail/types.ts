/**
 * Envio de e-mail transacional. O provedor real entra em docs/privacy/SUBPROCESSORS.md (LEG-S10).
 * E-mails carregam só o necessário (link, código); nunca conteúdo de saúde, notas ou medidas.
 */
export type MailTemplateId =
  | 'email-verification'
  | 'password-reset'
  /** Cadastro tentado com e-mail já existente (anti-enumeração, ADR-0014). */
  | 'account-exists'
  /** Aviso de mudança de segurança (MFA ligado/desligado, senha trocada). Só o tipo do evento. */
  | 'security-alert'
  | 'reminder'
  | 'export-ready'
  /** Recibo de pedido do titular (LEG-D07): protocolo, tipo, data e prazo. Sem conteúdo de saúde. */
  | 'privacy-request-received'
  /** Aviso de exclusão de conta (LEG-D04): data, o que fica e por quanto tempo, canal do encarregado. */
  | 'account-deleted';

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
