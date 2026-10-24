import { screen } from '@testing-library/react';
import { renderWithIntl } from '../../../tests/render';
import { HabitCheckButton } from './HabitCheckButton';

vi.mock('@/app/(app)/habitos/actions', () => ({ setHabitCheckAction: vi.fn() }));

/** Nome acessível contém o texto visível (WCAG 2.5.3, "Rótulo no nome"): comando de voz pelo que se vê. */
describe('HabitCheckButton: rótulo no nome', () => {
  it.each([
    [false, 'Marcar como feito', 'Marcar como feito: "Alongar", hoje'],
    [true, 'Feito', 'Feito: "Alongar", hoje (desmarcar)'],
  ])('done=%s: o nome começa pelo texto visível', (done, visible, name) => {
    renderWithIntl(<HabitCheckButton habitId="h1" name="Alongar" day="2026-10-07" done={done} />);
    const button = screen.getByRole('button', { name });
    expect(button).toHaveTextContent(visible);
    expect(button.getAttribute('aria-label')?.startsWith(button.textContent ?? '')).toBe(true);
    expect(button).toHaveAttribute('aria-pressed', String(done));
  });

  it('na grade (só ícone), o nome traz a data', () => {
    renderWithIntl(
      <HabitCheckButton
        habitId="h1"
        name="Alongar"
        day="2026-10-07"
        done={false}
        date="7 de outubro"
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Marcar "Alongar" como feito em 7 de outubro' }),
    ).toHaveTextContent('');
  });
});
