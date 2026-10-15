/**
 * Pedidos que a pessoa abre na Central (LEG-D07, ADR-0034). A exclusão tem fluxo próprio e a revisão do Índice
 * nasce no próprio Índice. Sem dependência de runtime: importado também por componentes cliente.
 */
export const OPENABLE_REQUEST_KINDS = [
  'confirmation_access',
  'correction',
  'portability',
  'sharing_info',
  'anonymization',
] as const;
export type OpenableRequestKind = (typeof OPENABLE_REQUEST_KINDS)[number];
