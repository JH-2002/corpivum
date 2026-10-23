import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('em formulário: o valor escolhido vai no envio pelo nome, sem `value` controlado', () => {
    render(
      <form data-testid="form">
        <ChoiceMenu name="category" label="Refeição" defaultValue="b" options={OPTIONS} />
      </form>,
    );
    const form = screen.getByTestId('form') as HTMLFormElement;
    expect(new FormData(form).get('category')).toBe('b');
    fireEvent.click(screen.getByRole('button', { name: 'Refeição: 5 de outubro' }));
    fireEvent.click(screen.getByRole('radio', { name: '28 de setembro' }));
    expect(new FormData(form).get('category')).toBe('a');
    expect(screen.getByRole('button', { name: 'Refeição: 28 de setembro' })).toBeInTheDocument();
  });

  it('dentro de fieldset desativado (exemplo da demo), não abre', () => {
    render(
      <fieldset disabled>
        <ChoiceMenu name="kind" label="Tipo" defaultValue="a" options={OPTIONS} />
      </fieldset>,
    );
    expect(screen.getByRole('button', { name: 'Tipo: 28 de setembro' })).toBeDisabled();
  });

  it('clique de verdade numa opção (o foco sai do botão antes do clique) troca o valor enviado', async () => {
    const user = userEvent.setup();
    // Como no app: um ancestral focável (`<main tabIndex={-1}>`) recebe o foco no clique do rótulo.
    render(
      <main tabIndex={-1} data-testid="main">
        <form data-testid="form">
          <ChoiceMenu name="category" label="Refeição" defaultValue="a" options={OPTIONS} />
        </form>
      </main>,
    );
    await user.click(screen.getByRole('button', { name: 'Refeição: 28 de setembro' }));
    // O Chrome leva o foco ao ancestral no mousedown do rótulo, antes do clique.
    fireEvent.focusOut(screen.getByRole('button', { name: /^Refeição:/ }), {
      relatedTarget: screen.getByTestId('main'),
    });
    await user.click(screen.getByText('5 de outubro'));
    const form = screen.getByTestId('form') as HTMLFormElement;
    expect(new FormData(form).get('category')).toBe('b');
    expect(screen.getByRole('button', { name: 'Refeição: 5 de outubro' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
