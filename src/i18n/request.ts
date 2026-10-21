import { getRequestConfig } from 'next-intl/server';
import { messages } from '@/i18n/messages';

export const DEFAULT_LOCALE = 'pt-BR';

export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  timeZone: 'America/Sao_Paulo',
  messages,
}));
