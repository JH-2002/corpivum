import type messages from '../../messages/pt-BR.json';

// Tipagem das chaves: `t('chave.inexistente')` falha no typecheck.
declare module 'next-intl' {
  interface AppConfig {
    Locale: 'pt-BR';
    Messages: typeof messages;
  }
}
