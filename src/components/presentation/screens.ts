/** As quatro telas do modo apresentação (§45, ADR-0035), na ordem da navegação. */
export const PRESENTATION_SCREENS = ['painel', 'twin', 'timeline', 'relatorio'] as const;
export type PresentationScreen = (typeof PRESENTATION_SCREENS)[number];

export function parsePresentationScreen(raw: unknown): PresentationScreen {
  return (PRESENTATION_SCREENS as readonly unknown[]).includes(raw)
    ? (raw as PresentationScreen)
    : 'painel';
}

/** `?dados=meus`: dados próprios (só na conta, com consentimento); qualquer outro valor é demonstração. */
export function wantsOwnData(raw: unknown): boolean {
  return raw === 'meus';
}

export type PresentationBase = '/apresentacao' | '/demo/apresentacao';

export function presentationHref(
  base: PresentationBase,
  screen: PresentationScreen,
  own: boolean,
): string {
  const params = new URLSearchParams({ tela: screen });
  if (own) params.set('dados', 'meus');
  return `${base}?${params.toString()}`;
}
