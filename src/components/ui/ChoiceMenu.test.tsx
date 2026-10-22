import { fireEvent, render, screen } from '@testing-library/react';
import { ChoiceMenu } from './ChoiceMenu';

const OPTIONS = [
  { value: 'a', label: '28 de setembro' },
  { value: 'b', label: '5 de outubro' },
];

describe('ChoiceMenu (estilo do seletor do app, 9c)', () => {
  it('botão com a opção atual, rádios com nome e Esc devolvendo o foco', () => {
    const onChange = vi.fn();
    render(<ChoiceMenu label="Data de antes" value="a" options={OPTIONS} onChange={onChange} />);
    const button = screen.getByRole('button', { name: 'Data de antes: 28 de setembro' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('radiogroup', { name: 'Data de antes' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '28 de setembro' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: '5 de outubro' }));
    expect(onChange).toHaveBeenCalledWith('b');
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });
});
