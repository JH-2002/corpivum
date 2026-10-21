import { screen } from '@testing-library/react';
import { renderWithIntl } from '../../../tests/render';
import { DemoReadOnlyNotice } from '@/components/health/DemoModeBanner';
import { DemoOnlyProvider } from './DemoOnlyContext';

vi.mock('@/app/(app)/inicio/actions', () => ({ switchToOwnDataAction: vi.fn() }));

/** Modo só demo (ADR-0043): a demonstração não convida a criar conta, que não existe nesse modo. */
describe('DemoReadOnlyNotice', () => {
  it('na demo pública comum, convida a criar conta', () => {
    renderWithIntl(<DemoReadOnlyNotice publicDemo />);
    expect(screen.getByText(/crie uma conta/)).toBeInTheDocument();
  });

  it('no modo só demo, só avisa que nada pode ser registrado', () => {
    renderWithIntl(
      <DemoOnlyProvider value>
        <DemoReadOnlyNotice publicDemo />
      </DemoOnlyProvider>,
    );
    expect(screen.queryByText(/crie uma conta/)).not.toBeInTheDocument();
    expect(screen.getByText(/Nada pode ser registrado aqui/)).toBeInTheDocument();
  });
});
