import { act, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { renderWithIntl } from '../../../tests/render';
import { TwinViewport } from './TwinViewport';
import { SLOW_LOAD_MS, useSlowLoad } from './useSlowLoad';

// A detecção real de WebGL não roda no jsdom: aqui o navegador "tem" 3D.
vi.mock('./hooks', () => ({ useWebGLSupport: () => 'yes' }));

/**
 * Carga lenta do modelo 3D (ADR-0028): depois de `SLOW_LOAD_MS` sem modelo pronto e sem erro, o twin avisa e
 * oferece a versão 2D; a cena continua carregando até a pessoa escolher o 2D.
 */
describe('useSlowLoad', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fica lento só depois de 20 s com a mesma espera', () => {
    const { result } = renderHook(({ key }) => useSlowLoad(key), {
      initialProps: { key: 'a.glb' as string | null },
    });
    expect(SLOW_LOAD_MS).toBe(20_000);
    act(() => vi.advanceTimersByTime(SLOW_LOAD_MS - 1));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });

  it('modelo pronto ou erro (chave nula) zera; outro arquivo recomeça a contagem', () => {
    const { result, rerender } = renderHook(({ key }) => useSlowLoad(key), {
      initialProps: { key: 'a.glb' as string | null },
    });
    act(() => vi.advanceTimersByTime(SLOW_LOAD_MS));
    expect(result.current).toBe(true);
    rerender({ key: null });
    expect(result.current).toBe(false);
    rerender({ key: 'b.glb' });
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(SLOW_LOAD_MS / 2));
    rerender({ key: 'a.glb' });
    act(() => vi.advanceTimersByTime(SLOW_LOAD_MS / 2));
    expect(result.current).toBe(false);
  });
});

function SlowScene({
  onSlow,
  onUnmount,
}: {
  onSlow: (slow: boolean) => void;
  onUnmount: () => void;
}) {
  useEffect(() => {
    onSlow(true);
    return onUnmount;
  }, [onSlow, onUnmount]);
  return <div data-testid="scene-3d" />;
}

describe('TwinViewport com carga lenta', () => {
  it('avisa fora da imagem, mantém a cena e troca para 2D só no botão', async () => {
    const user = userEvent.setup();
    const unmounted = vi.fn();
    renderWithIntl(
      <TwinViewport
        label="Corpo"
        hover={null}
        onHoverEnd={() => undefined}
        tooltip={() => null}
        onDrag={() => undefined}
        scene={(_onFail, onSlow) => <SlowScene onSlow={onSlow} onUnmount={unmounted} />}
        fallback={<div data-testid="scene-2d" />}
      />,
    );
    const notice = screen.getByTestId('twin-slow-notice');
    expect(notice).toHaveTextContent('Está demorando mais que o esperado');
    // Anunciado (região viva) e acessível: não fica dentro da área role="img".
    expect(notice.closest('[role="status"]')).not.toBeNull();
    expect(notice.closest('[role="img"]')).toBeNull();
    // O holograma continua tentando: a cena 3D segue montada.
    expect(screen.getByTestId('scene-3d')).toBeInTheDocument();
    expect(unmounted).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Ver versão 2D' }));
    expect(screen.getByTestId('scene-2d')).toBeInTheDocument();
    expect(screen.queryByTestId('scene-3d')).toBeNull();
    expect(unmounted).toHaveBeenCalled();
    expect(screen.queryByTestId('twin-slow-notice')).toBeNull();
    expect(screen.getByTestId('twin-chose-2d-notice')).toHaveTextContent('versão 2D');
    // Escolha da pessoa, não falha do navegador: sem o aviso de "não exibe 3D".
    expect(screen.queryByTestId('twin-fallback-notice')).toBeNull();
  });
});
