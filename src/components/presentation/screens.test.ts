import {
  parsePresentationScreen,
  PRESENTATION_SCREENS,
  presentationHref,
  wantsOwnData,
} from './screens';

describe('telas do modo apresentação (§45)', () => {
  it('quatro telas na ordem: painel, corpo 3D, timeline e relatório', () => {
    expect(PRESENTATION_SCREENS).toEqual(['painel', 'twin', 'timeline', 'relatorio']);
  });

  it('valor desconhecido ou ausente cai no painel', () => {
    expect(parsePresentationScreen('twin')).toBe('twin');
    for (const raw of [undefined, '', 'sono', ['twin'], 'TWIN']) {
      expect(parsePresentationScreen(raw)).toBe('painel');
    }
  });

  it('meus dados só com o valor exato; o endereço leva a tela e a escolha', () => {
    expect(wantsOwnData('meus')).toBe(true);
    for (const raw of [undefined, 'sim', ['meus']]) expect(wantsOwnData(raw)).toBe(false);
    expect(presentationHref('/apresentacao', 'timeline', true)).toBe(
      '/apresentacao?tela=timeline&dados=meus',
    );
    expect(presentationHref('/demo/apresentacao', 'painel', false)).toBe(
      '/demo/apresentacao?tela=painel',
    );
  });
});
