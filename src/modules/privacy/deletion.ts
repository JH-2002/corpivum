/**
 * Frase da confirmação explícita da exclusão de conta (LEG-D04, ADR-0034). Exibida na tela e conferida no
 * servidor: comparação exata depois de juntar espaços e ignorar maiúsculas. Sem dependência de runtime.
 */
export const DELETION_PHRASE = 'excluir minha conta';

export function normalizePhrase(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

export function isDeletionPhrase(value: string): boolean {
  return normalizePhrase(value) === DELETION_PHRASE;
}
