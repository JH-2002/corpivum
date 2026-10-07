/**
 * Subprocessadores (LEG-D06, LEG-S10). Espelho de docs/privacy/SUBPROCESSORS.md (tabela de produção): o
 * teste `subprocessors.test.ts` falha se os serviços divergirem. Textos em `subprocessors.items.<key>`.
 * Fornecedor e situação ficam "a definir" até a escolha da hospedagem (OPEN_ISSUES OI-11).
 */
export const SUBPROCESSORS = [
  'hosting',
  'database',
  'backups',
  'storage',
  'jobs',
  'kms',
  'email',
  'errors',
  'llm',
] as const;
export type SubprocessorKey = (typeof SUBPROCESSORS)[number];
