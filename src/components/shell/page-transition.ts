/**
 * Tipo da transição de troca de página pelo menu (9f, ADR-0055). Só navegações com este tipo animam o conteúdo
 * (`PAGE_TRANSITION` no `<ViewTransition>` dos layouts): as outras transições do React (modo privacidade, troca de
 * período, `router.refresh`) não esperam animação nenhuma para aparecer.
 */
export const PAGE_TRANSITION_TYPE = 'hm-page';

/** Classe do `<ViewTransition>` do conteúdo: esmaece só na troca de página pelo menu; nas demais, nada. */
export const PAGE_TRANSITION = { [PAGE_TRANSITION_TYPE]: 'auto', default: 'none' } as const;
