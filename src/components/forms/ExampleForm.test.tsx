import { screen } from '@testing-library/react';
import { renderWithIntl } from '../../../tests/render';
import { ExampleForm } from './ExampleForm';

vi.mock('@/components/demo/DemoOnlyContext', () => ({ useDemoOnly: () => false }));
vi.mock('@/app/(app)/inicio/actions', () => ({ switchToOwnDataAction: vi.fn() }));

describe('formulário de exemplo do demo (9b)', () => {
  it('mostra o aviso fixo e desativa campos e envio', () => {
    const onSubmit = vi.fn();
    renderWithIntl(
      <ExampleForm publicDemo>
        <form onSubmit={onSubmit}>
          <label>
            Peso
            <input name="weightKg" defaultValue="73,9" />
          </label>
          <button type="submit">Salvar</button>
        </form>
      </ExampleForm>,
    );
    expect(screen.getByText(/na demonstração nada é salvo/)).toBeVisible();
    expect(screen.getByLabelText('Peso')).toBeDisabled();
    expect(screen.getByLabelText('Peso')).toHaveValue('73,9');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(screen.getByRole('group')).toHaveAccessibleDescription(/nada é salvo/);
  });
});
