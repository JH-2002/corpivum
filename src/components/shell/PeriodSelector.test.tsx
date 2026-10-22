import { fireEvent, screen } from '@testing-library/react';
import { renderWithIntl } from '../../../tests/render';
import { PeriodSelector } from './PeriodSelector';

const shell = vi.hoisted(() => ({ setPeriod: vi.fn() }));
vi.mock('./ShellProvider', () => ({
  useShell: () => ({ period: { preset: '30d' }, today: '2026-10-21', setPeriod: shell.setPeriod }),
}));

describe('seletor de período em botões segmentados (9b, §10)', () => {
  beforeEach(() => shell.setPeriod.mockClear());

  it('é um grupo de rádios nativos com nome acessível e a opção atual marcada', () => {
    renderWithIntl(<PeriodSelector />);
    const group = screen.getByRole('radiogroup', { name: 'Período' });
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.closest('label')?.textContent)).toEqual([
      '7 dias',
      '30 dias',
      '90 dias',
      '12 meses',
      'Personalizado',
    ]);
    expect(group).toContainElement(radios[0] ?? null);
    expect(screen.getByRole('radio', { name: '30 dias' })).toBeChecked();
    expect(screen.getByText(/^\d{2}\/\d{2}\/\d{4} a \d{2}\/\d{2}\/\d{4}$/)).toBeInTheDocument();
  });

  it('trocar a opção aplica o período; "Personalizado" só aplica depois de validar as datas', () => {
    renderWithIntl(<PeriodSelector />);
    fireEvent.click(screen.getByRole('radio', { name: '7 dias' }));
    expect(shell.setPeriod).toHaveBeenCalledWith({ preset: '7d' });

    fireEvent.click(screen.getByRole('radio', { name: 'Personalizado' }));
    expect(screen.getByRole('radio', { name: 'Personalizado' })).toBeChecked();
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-10' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/data inicial/);
    expect(shell.setPeriod).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(shell.setPeriod).toHaveBeenLastCalledWith({
      preset: 'custom',
      from: '2026-10-10',
      to: '2026-10-15',
    });
  });

  it('no celular, o botão do menu diz a opção atual e controla a lista', () => {
    renderWithIntl(<PeriodSelector />);
    const toggle = screen.getByRole('button', { name: 'Período: 30 dias. Trocar período' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', screen.getByRole('radiogroup').id);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });
});
