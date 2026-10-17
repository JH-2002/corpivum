import type { RequiredDocument } from '@/modules/consent';

/**
 * Texto do aviso de cada versão não substancial publicada (ADR-0031), em `policyNotice.changes.<doc>.v<n>`. O
 * texto descreve aquela versão; versão nova exige chave nova (o teste do catálogo cobra). Sem chave: texto
 * genérico, sem afirmar nada sobre a mudança.
 */
export const NOTICE_CHANGE_KEYS: Partial<
  Record<RequiredDocument, Partial<Record<number, string>>>
> = {
  terms: { 2: 'changes.terms.v2' },
  privacy_policy: { 2: 'changes.privacy_policy.v2' },
};

export function noticeChangeKey(document: RequiredDocument, version: number): string | null {
  return NOTICE_CHANGE_KEYS[document]?.[version] ?? null;
}
