import { randomUUID } from 'node:crypto';
import { logger as defaultLogger, maskEmail, type Logger } from '@/lib/logger';
import type { MailMessage, MailProvider } from './types';

const OUTBOX_LIMIT = 50;

interface ConsoleMailOptions {
  logger?: Logger;
  /**
   * Guarda as mensagens completas (inclusive tokens) em memória para os testes lerem.
   * Só ligar em APP_ENV=test; fora disso nada além do log de metadados é mantido.
   */
  keepOutbox?: boolean;
}

/**
 * Provedor de e-mail para DESENVOLVIMENTO: não envia nada. Registra só metadados
 * (template e destinatário mascarado).
 */
export class ConsoleMailProvider implements MailProvider {
  readonly id = 'console';
  readonly #outbox: Array<MailMessage & { id: string }> = [];
  readonly #logger: Logger;
  readonly #keepOutbox: boolean;

  constructor({ logger = defaultLogger, keepOutbox = false }: ConsoleMailOptions = {}) {
    this.#logger = logger;
    this.#keepOutbox = keepOutbox;
  }

  /** Mensagens guardadas (vazio se `keepOutbox` estiver desligado). Limitado às últimas 50. */
  get outbox(): ReadonlyArray<MailMessage & { id: string }> {
    return this.#outbox;
  }

  async send(message: MailMessage): Promise<{ id: string }> {
    const id = randomUUID();
    if (this.#keepOutbox) {
      this.#outbox.push({ ...message, id });
      if (this.#outbox.length > OUTBOX_LIMIT) this.#outbox.shift();
    }
    this.#logger.info('mail.sent', {
      adapter: this.id,
      template: message.template,
      recipient: maskEmail(message.to),
    });
    return { id };
  }
}
