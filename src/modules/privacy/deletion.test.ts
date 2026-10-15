// @vitest-environment node
import { DELETION_PHRASE, isDeletionPhrase } from './deletion';

/** LEG-D04: a frase da exclusão confere só exata, depois de juntar espaços e ignorar maiúsculas. */
describe('frase da exclusão de conta', () => {
  it.each([
    DELETION_PHRASE,
    '  Excluir   minha CONTA ',
    'EXCLUIR MINHA CONTA',
    'excluir\tminha conta',
  ])('aceita %j', (value) => {
    expect(isDeletionPhrase(value)).toBe(true);
  });

  it.each(['', 'excluir conta', 'excluir minha conta agora', 'excluír minha conta', 'sim'])(
    'recusa %j',
    (value) => {
      expect(isDeletionPhrase(value)).toBe(false);
    },
  );
});
