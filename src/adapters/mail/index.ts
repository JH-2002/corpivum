import type { Env } from '@/lib/env';
import { ConsoleMailProvider } from './console';
import { DevSmtpMailProvider } from './dev-smtp';
import type { MailProvider } from './types';

export type * from './types';

/**
 * `console` é o provedor local (recusado em produção por `parseEnv`):
 * - APP_ENV=development: entrega ao Mailpit local via SMTP, para ler os links (ADR-0023);
 * - APP_ENV=test: só guarda as mensagens em memória para os testes.
 */
export function createMailProvider(
  env: Pick<Env, 'MAIL_PROVIDER' | 'APP_ENV' | 'DEV_SMTP_HOST' | 'DEV_SMTP_PORT'>,
): MailProvider {
  switch (env.MAIL_PROVIDER) {
    case 'console':
      if (env.APP_ENV === 'development') {
        return new DevSmtpMailProvider({ host: env.DEV_SMTP_HOST, port: env.DEV_SMTP_PORT });
      }
      return new ConsoleMailProvider({ keepOutbox: env.APP_ENV === 'test' });
  }
}
