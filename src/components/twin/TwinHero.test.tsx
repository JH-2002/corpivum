import { fireEvent, screen, within } from '@testing-library/react';
import { bodyEntry, day } from '@/modules/insights/fixtures';
import { BODY_MODEL_STORAGE_KEY, toTwinRows } from '@/modules/twin';
import { findForbiddenTerms } from '../../../tests/content/forbidden-terms';
import { renderWithIntl } from '../../../tests/render';
import { TwinHero } from './TwinHero';

const rows = toTwinRows([
  bodyEntry(day(0), { weightKg: 70, heightCm: 172, waistCm: 80, hipCm: 96 }),
  bodyEntry(day(6), { weightKg: 71, waistCm: 81.5 }),
]);

describe('twin no início (ADR-0049)', () => {
  afterEach(() => window.localStorage.clear());

  it('painel da região com medida, unidade, data, variação neutra e selo; troca por botão', () => {
    window.localStorage.setItem(BODY_MODEL_STORAGE_KEY, 'feminine');
    renderWithIntl(<TwinHero rows={rows} latestHeightCm={null} demo={false} href="/twin" />);
    const hero = screen.getByRole('region', { name: 'Seu corpo no período' });
    const waist = within(hero).getByRole('button', { name: 'Cintura' });
    // Começa na primeira região com medida (peito não tem: cintura).
    expect(waist).toHaveAttribute('aria-pressed', 'true');
    expect(hero).toHaveTextContent('81,5 cm');
    expect(hero).toHaveTextContent(/Registrada em/);
    expect(hero).toHaveTextContent('+1,5 cm');
    expect(
      within(hero).getAllByRole('button', { name: 'Origem do dado: Informado' }).length,
    ).toBeGreaterThan(0);
    fireEvent.click(within(hero).getByRole('button', { name: 'Quadril' }));
    expect(hero).toHaveTextContent('96 cm');
    expect(within(hero).getByRole('link', { name: 'Abrir twin completo' })).toHaveAttribute(
      'href',
      '/twin',
    );
    expect(findForbiddenTerms(hero.textContent ?? '').map((t) => t.id)).toEqual([]);
  });

  it('modo privacidade: números ocultos', () => {
    window.localStorage.setItem(BODY_MODEL_STORAGE_KEY, 'feminine');
    renderWithIntl(<TwinHero rows={rows} latestHeightCm={null} demo={false} hidden href="/twin" />);
    const hero = screen.getByRole('region', { name: 'Seu corpo no período' });
    expect(hero).not.toHaveTextContent('81,5');
    expect(hero).toHaveTextContent(/oculto/);
    expect(hero).toHaveTextContent('forma de referência');
    expect(within(hero).getByTestId('body-disclaimer')).toHaveTextContent(
      'Não é avaliação corporal',
    );
  });

  it('demo: selos DEMO e nenhuma pergunta de modelo', () => {
    renderWithIntl(<TwinHero rows={rows} latestHeightCm={null} demo href="/demo/twin" />);
    const hero = screen.getByRole('region', { name: 'Seu corpo no período' });
    expect(within(hero).queryByRole('heading', { name: /Qual modelo/ })).toBeNull();
    expect(
      within(hero).getAllByRole('button', { name: 'Origem do dado: Demo' }).length,
    ).toBeGreaterThan(0);
    expect(within(hero).queryByRole('button', { name: 'Origem do dado: Informado' })).toBeNull();
  });
});
