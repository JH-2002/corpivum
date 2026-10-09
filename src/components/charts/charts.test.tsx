import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/render';
import { findForbiddenTerms } from '../../../tests/content/forbidden-terms';
import { CHART_GUIDES, ChartGuide, dashPattern } from './ChartGuide';
import { Sparkline } from './Sparkline';
import { TimeChart } from './TimeChart';

const SERIES = [
  { key: 'hours', label: 'Sono', unit: 'h', kind: 'bar' as const, color: 'red' },
  { key: 'steps', label: 'Passos', kind: 'line' as const, color: 'blue', dash: '4 2' },
];

describe('gráficos (§13, §34)', () => {
  it('sem nenhum valor: estado "sem dados", nunca um gráfico vazio', () => {
    renderWithIntl(
      <TimeChart
        title="Sono no período"
        badge="INFORMADO"
        data={[{ day: '2026-10-01', hours: null, steps: null }]}
        series={SERIES}
      />,
    );
    expect(screen.getByText('Sem registros neste período')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Séries do gráfico/ })).not.toBeInTheDocument();
  });

  it('com dados: legenda alternável (aria-pressed), selo e tabela alternativa', async () => {
    renderWithIntl(
      <TimeChart
        title="Sono no período"
        badge="DEMO"
        data={[
          { day: '2026-10-01', hours: 7.5, steps: null },
          { day: '2026-10-02', hours: null, steps: 4 },
          { day: '2026-10-03', hours: null, steps: null },
        ]}
        series={SERIES}
      />,
    );
    const sono = screen.getByRole('button', { name: /^Sono/ });
    expect(sono).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(sono);
    expect(sono).toHaveAttribute('aria-pressed', 'false');
    // A última série visível não some.
    const steps = screen.getByRole('button', { name: /^Passos/ });
    await userEvent.click(steps);
    expect(steps).toHaveAttribute('aria-pressed', 'true');

    expect(screen.getByRole('button', { name: 'Origem do dado: Demo' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Sono no período' });
    // Só dias com algum valor; vírgula decimal.
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(table).toHaveTextContent('7,5');
  });

  it('"Como ler este gráfico": séries com tipo, traço, eixo e unidade; selo e o que fazer', async () => {
    renderWithIntl(
      <TimeChart
        title="Sono e passos"
        badge="INFORMADO"
        guide="combined"
        describedBy="resumo"
        data={[{ day: '2026-10-01', hours: 7.5, steps: 4 }]}
        series={[
          { key: 'hours', label: 'Sono', unit: 'h', kind: 'bar', color: 'red' },
          {
            key: 'steps',
            label: 'Passos',
            kind: 'line',
            color: 'blue',
            dash: '6 4',
            axis: 'right',
          },
        ]}
      />,
    );
    expect(screen.getByRole('region', { name: 'Sono e passos' })).toHaveAttribute(
      'aria-describedby',
      'resumo',
    );
    const summary = screen.getByText('Como ler este gráfico');
    await userEvent.click(summary);
    const guide = summary.closest('details');
    expect(guide).toHaveAttribute('open');
    expect(guide).toHaveTextContent('Sono: barras, no eixo da esquerda, em h.');
    expect(guide).toHaveTextContent('Passos: linha tracejada, no eixo da direita.');
    expect(guide).toHaveTextContent('Selo “Informado”: Você registrou este dado.');
    expect(guide).toHaveTextContent('O que fazer com isso');
  });

  it('padrão de traço em palavras (não só cor)', () => {
    expect(dashPattern(undefined)).toBe('solid');
    expect(dashPattern('6 4')).toBe('dashed');
    expect(dashPattern('2 3')).toBe('dotted');
    expect(dashPattern('1 4')).toBe('dotted');
  });

  it.each(CHART_GUIDES)('guia "%s" existe no catálogo e não tem termo proibido', (id) => {
    const { container } = renderWithIntl(<ChartGuide id={id} badge="DEMO" />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/charts\.guide\./);
    expect(text).toContain('Dado fictício de demonstração.');
    expect(findForbiddenTerms(text)).toEqual([]);
  });

  it('sparkline sem valores não desenha nada', () => {
    const { container } = renderWithIntl(
      <Sparkline data={[{ day: '2026-10-01', value: null }]} color="red" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
