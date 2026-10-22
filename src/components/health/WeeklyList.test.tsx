import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/render';
import { formatMeasure, formatSignedMeasure } from './format';
import { WeeklyList, type WeekBlock } from './WeeklyList';

const WEEKS: WeekBlock[] = [
  ['2026-10-19', '2026-10-25'],
  ['2026-10-12', '2026-10-18'],
  ['2026-10-05', '2026-10-11'],
  ['2026-09-28', '2026-10-04'],
  ['2026-09-21', '2026-09-27'],
].map(([start, end]) => ({ start: start!, end: end!, content: <p>itens de {start}</p> }));

describe('WeeklyList (listas por semana)', () => {
  it('mostra as 2 semanas mais recentes, com título e contador', () => {
    renderWithIntl(<WeeklyList weeks={WEEKS} />);
    expect(screen.getByRole('heading', { name: 'Semana de 19 a 25 out' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Semana de 12 a 18 out' })).toBeInTheDocument();
    expect(screen.queryByText('itens de 2026-10-05')).not.toBeInTheDocument();
    expect(screen.getByText('Mostrando 2 de 5 semanas')).toBeInTheDocument();
  });

  it('"Ver mais" revela mais 2 semanas, leva o foco à primeira nova e some no fim', async () => {
    const user = userEvent.setup();
    renderWithIntl(<WeeklyList weeks={WEEKS} />);
    const more = screen.getByRole('button', { name: 'Ver mais semanas' });
    expect(more).toHaveAttribute('aria-controls');
    await user.click(more);
    expect(screen.getByRole('heading', { name: 'Semana de 5 a 11 out' })).toHaveFocus();
    // Semana que cruza o mês: os dois meses no título.
    expect(screen.getByRole('heading', { name: 'Semana de 28 set a 4 out' })).toBeInTheDocument();
    expect(screen.getByText('Mostrando 4 de 5 semanas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver mais semanas' }));
    expect(screen.getByText('itens de 2026-09-21')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver mais semanas' })).not.toBeInTheDocument();
  });

  it('com até 2 semanas, sem botão nem contador', () => {
    renderWithIntl(<WeeklyList weeks={WEEKS.slice(0, 2)} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
  });
});

describe('formatMeasure (unidade em toda medida)', () => {
  it('número em pt-BR com a unidade', () => {
    expect(formatMeasure(73.95, 'kg')).toBe('74 kg');
    expect(formatMeasure(73.9, 'kg')).toBe('73,9 kg');
    expect(formatMeasure(84.5, 'cm')).toBe('84,5 cm');
    expect(formatMeasure(18, '%')).toBe('18%');
  });

  it('com sinal explícito', () => {
    expect(formatSignedMeasure(0.4, 'kg')).toBe('+0,4 kg');
    expect(formatSignedMeasure(-1.2, 'cm')).toBe('−1,2 cm');
    expect(formatSignedMeasure(0, 'kg')).toBe('0 kg');
  });
});
