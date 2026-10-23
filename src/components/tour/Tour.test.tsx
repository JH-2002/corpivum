import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/render';

const markTourSeenAction = vi.fn(async () => {});
const replace = vi.fn();
let search = '';

vi.mock('@/app/(app)/inicio/actions', () => ({ markTourSeenAction }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/inicio',
  useSearchParams: () => new URLSearchParams(search),
}));

const { DEMO_TOUR_STORAGE_KEY, Tour } = await import('./Tour');

// O jsdom não implementa o modal nativo nem a rolagem.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.open = false;
  };
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  markTourSeenAction.mockClear();
  replace.mockClear();
  search = '';
  window.localStorage.clear();
});

/** Painel mínimo: resumo, índice e ajuda; sem cartões, gráfico nem período (passos pulados). */
function Page({ children }: { children: React.ReactNode }) {
  return (
    <>
      <section data-tour="summary">Resumo</section>
      <section data-tour="score">Índice</section>
      <div data-tour="help">
        <button type="button">Ajuda</button>
      </div>
      {children}
    </>
  );
}

const dialog = () => document.querySelector('dialog');

/** O tour abre no quadro seguinte à montagem. */
const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

describe('tour do painel (ADR-0025)', () => {
  it('abre na primeira visita e pula passos sem alvo na tela', async () => {
    renderWithIntl(
      <Page>
        <Tour autoStart persist="server" />
      </Page>,
    );
    await nextFrame();
    expect(dialog()?.open).toBe(true);
    expect(screen.getByText('Passo 1 de 6')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Boas-vindas ao seu painel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próximo' })).toHaveFocus();
  });

  it('avança e volta; o alvo do passo ganha contorno', async () => {
    renderWithIntl(
      <Page>
        <Tour autoStart persist="server" />
      </Page>,
    );
    await nextFrame();
    await userEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByText('Passo 2 de 6')).toBeInTheDocument();
    expect(screen.getByText('Resumo').closest('[data-tour]')).toHaveAttribute('data-tour-active');
    await userEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByRole('heading', { name: 'Índice de Bem-Estar' })).toBeInTheDocument();
    expect(screen.getByText('Resumo').closest('[data-tour]')).not.toHaveAttribute(
      'data-tour-active',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByText('Passo 2 de 6')).toBeInTheDocument();
  });

  it('Esc pula: fecha, lembra na conta e devolve o foco ao menu de ajuda', async () => {
    renderWithIntl(
      <Page>
        <Tour autoStart persist="server" />
      </Page>,
    );
    await nextFrame();
    act(() => {
      fireEvent(dialog()!, new Event('cancel', { cancelable: true }));
    });
    expect(dialog()?.open).toBe(false);
    expect(markTourSeenAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Ajuda' })).toHaveFocus();
  });

  it('concluir no último passo também lembra; nada fica com contorno', async () => {
    renderWithIntl(
      <Page>
        <Tour autoStart persist="server" />
      </Page>,
    );
    await nextFrame();
    for (let i = 0; i < 5; i += 1) {
      await userEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    }
    await userEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(dialog()?.open).toBe(false);
    expect(markTourSeenAction).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-tour-active]')).toBeNull();
  });

  it('passos da 9d: Registrar no alvo visível, escolha do tema e campo explicado', async () => {
    renderWithIntl(
      <Page>
        <div data-tour="register" data-testid="topo">
          <button type="button">Registrar</button>
        </div>
        <div data-tour="register" data-testid="barra">
          <button type="button">Registrar</button>
        </div>
        <Tour autoStart persist="server" />
      </Page>,
    );
    // No celular, o do topo está escondido (`hidden md:block`) e só o da barra de baixo tem caixa.
    const barra = screen.getByTestId('barra');
    barra.getClientRects = () => [new DOMRect(0, 0, 60, 60)] as unknown as DOMRectList;
    await nextFrame();
    for (let i = 0; i < 3; i += 1) {
      await userEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    }
    expect(screen.getByRole('heading', { name: 'Registrar' })).toBeInTheDocument();
    expect(barra).toHaveAttribute('data-tour-active');
    expect(screen.getByTestId('topo')).not.toHaveAttribute('data-tour-active');
    await userEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByRole('heading', { name: 'Escolha o que registrar' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByRole('heading', { name: 'Cada campo se explica' })).toBeInTheDocument();
    expect(document.querySelector('[data-tour-active]')).toBeNull();
  });

  it('já visto: não abre sozinho', async () => {
    renderWithIntl(
      <Page>
        <Tour autoStart={false} persist="server" />
      </Page>,
    );
    await nextFrame();
    expect(dialog()?.open).toBeFalsy();
  });

  it('reaberto pelo menu de ajuda (?tour=1); ao fechar, limpa o parâmetro', async () => {
    search = 'tour=1';
    renderWithIntl(
      <Page>
        <Tour autoStart={false} persist="server" />
      </Page>,
    );
    await nextFrame();
    expect(dialog()?.open).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Pular tour' }));
    expect(replace).toHaveBeenCalledWith('/inicio', { scroll: false });
  });

  it('demo público: lembra só no navegador, sem chamar o servidor', async () => {
    const first = renderWithIntl(
      <Page>
        <Tour autoStart persist="local" />
      </Page>,
    );
    await nextFrame();
    await userEvent.click(screen.getByRole('button', { name: 'Pular tour' }));
    expect(window.localStorage.getItem(DEMO_TOUR_STORAGE_KEY)).toBe('1');
    expect(markTourSeenAction).not.toHaveBeenCalled();
    first.unmount();

    renderWithIntl(
      <Page>
        <Tour autoStart persist="local" />
      </Page>,
    );
    await nextFrame();
    expect(dialog()?.open).toBeFalsy();
  });

  it('armazenamento bloqueado: o tour ainda abre e fecha sem erro', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    renderWithIntl(
      <Page>
        <Tour autoStart persist="local" />
      </Page>,
    );
    await nextFrame();
    expect(dialog()?.open).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Pular tour' }));
    expect(dialog()?.open).toBe(false);
    spy.mockRestore();
    set.mockRestore();
  });
});
