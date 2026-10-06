import { randomUUID } from 'node:crypto';
import { logger as defaultLogger, maskEmail, type Logger } from '@/lib/logger';
import type { MailMessage, MailProvider } from './types';

/**
 * Provedor de e-mail para DESENVOLVIMENTO: não envia nada. Registra só metadados
 * (template e destinatário mascarado) e guarda as mensagens em memória para testes.
 */
export class ConsoleMailProvider implements MailProvider {
  readonly id = 'console';
  readonly outbox: Array<MailMessage & { id: string }> = [];
  readonly #logger: Logger;

  constructor(logger: Logger = defaultLogger) {
    this.#logger = logger;
  }

  async send(message: MailMessage): Promise<{ id: string }> {
    const id = randomUUID();
    this.outbox.push({ ...message, id });
    this.#logger.info('mail.sent', {
      adapter: this.id,
      template: message.template,
      recipient: maskEmail(message.to),
    });
    return { id };
  }
}
