import type { Env } from '@/lib/env';
import { ConsoleMailProvider } from './console';
import type { MailProvider } from './types';

export type * from './types';

export function createMailProvider(env: Pick<Env, 'MAIL_PROVIDER'>): MailProvider {
  switch (env.MAIL_PROVIDER) {
    case 'console':
      return new ConsoleMailProvider();
  }
}
