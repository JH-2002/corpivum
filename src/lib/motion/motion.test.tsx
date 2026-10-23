import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { HabitCheckButton } from '@/components/health/HabitCheckButton';
import { WeeklyList } from '@/components/health/WeeklyList';
import { CountUp, formatCount } from '@/components/ui/CountUp';
import { Magnetic } from '@/components/ui/Magnetic';
import { messages } from '@/i18n/messages';
import { addDays } from '@/lib/dates';
import { generateDemoData } from '@/modules/demo/generator';
import { buildDashboard } from '@/modules/health/dashboard';
import { createDemoSource } from '@/modules/health/source';
import { renderWithIntl } from '../../../tests/render';
import { MOTION_INIT_SCRIPT, MOTION_STORAGE_KEY } from './init-script';
import { useReducedMotion } from './motion';
import { useReveal } from './reveal';

vi.mock('@/app/(app)/habitos/actions', () => ({ setHabitCheckAction: vi.fn() }));
vi.mock('@/app/(app)/inicio/actions', () => ({
  toggleHabitCheckAction: vi.fn(),
  reviewScoreAction: vi.fn(),
}));

/** Simula as mídias do aparelho: ponteiro fino (mouse) e `prefers-reduced-motion`. */
function mockMedia({ fine, reduced }: { fine: boolean; reduced: boolean }) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('pointer: fine')
      ? fine
      : query.includes('reduced-motion')
        ? reduced
        : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

/** IntersectionObserver controlado pelo teste: `enter()` diz que todos os observados entraram na tela. */
const observers: Array<{ cb: IntersectionObserverCallback; els: Element[] }> = [];
class FakeObserver {
  private entry: { cb: IntersectionObserverCallback; els: Element[] };
  constructor(cb: IntersectionObserverCallback) {
    this.entry = { cb, els: [] };
    observers.push(this.entry);
  }
  observe(el: Element) {
    this.entry.els.push(el);
  }
  disconnect() {
    this.entry.els = [];
  }
}
function enter() {
  for (const o of observers) {
    const entries = o.els.map((target) => ({ target, isIntersecting: true }));
    if (entries.length) o.cb(entries as unknown as IntersectionObserverEntry[], {} as never);
  }
}

/** Tudo fora da tela (abaixo da dobra), como os cartões do início ao hidratar. */
function belowTheFold() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 5000,
    bottom: 5100,
    left: 0,
    right: 100,
    width: 100,
    height: 100,
    x: 0,
    y: 5000,
    toJSON: () => ({}),
  });
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  mockMedia({ fine: true, reduced: false });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  delete document.documentElement.dataset.motion;
});

function Probe() {
  return <p>{useReducedMotion() ? 'reduzido' : 'normal'}</p>;
}

describe('preferência de movimento (9f, ADR-0055)', () => {
  it('une o sistema e a opção do app; gráficos, tour e twin usam a mesma', () => {
    renderWithIntl(<Probe />);
    expect(screen.getByText('normal')).toBeInTheDocument();
  });

  it('com a opção "Reduzir animações" do app, reduz mesmo sem pedido do sistema', () => {
    window.localStorage.setItem(MOTION_STORAGE_KEY, 'reduced');
    renderWithIntl(<Probe />);
    expect(screen.getByText('reduzido')).toBeInTheDocument();
  });

  it('com prefers-reduced-motion do sistema, reduz', () => {
    mockMedia({ fine: true, reduced: true });
    renderWithIntl(<Probe />);
    expect(screen.getByText('reduzido')).toBeInTheDocument();
  });

  it('script inicial marca o <html> antes da hidratação só com a opção ligada, e não quebra sem storage', () => {
    const run = () => new Function(MOTION_INIT_SCRIPT)() as void;
    run();
    expect(document.documentElement.dataset.motion).toBeUndefined();
    window.localStorage.setItem(MOTION_STORAGE_KEY, 'reduced');
    run();
    expect(document.documentElement.dataset.motion).toBe('reduced');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(run).not.toThrow();
  });
});

describe('contagem dos números (CountUp)', () => {
  it('formata inteiro, porcentagem e duração', () => {
    expect(formatCount(71.6, 'integer')).toBe('72');
    expect(formatCount(83, 'percent')).toBe('83%');
    expect(formatCount(452, 'duration')).toBe('7 h 32 min');
  });

  it('já visível ao hidratar: mostra o valor final, sem contar', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    const { container } = renderWithIntl(<CountUp value={72} />);
    expect(container).toHaveTextContent(/^72$/);
    expect(container.querySelector('[aria-hidden="true"]')).toBeEmptyDOMElement();
  });

  it('fora da tela: conta ao entrar; o valor final continua no DOM para o leitor de tela', () => {
    belowTheFold();
    const { container } = renderWithIntl(<CountUp value={80} format="percent" />);
    const [final, counter] = container.querySelectorAll('[data-count-up] > span');
    expect(final).toHaveTextContent('80%');
    expect(final).not.toHaveAttribute('aria-hidden');
    expect(counter).toHaveAttribute('aria-hidden', 'true');
    expect(counter).toHaveTextContent('0%');
    act(() => {
      enter();
      vi.advanceTimersByTime(400);
    });
    expect(Number.parseInt(counter?.textContent ?? '', 10)).toBeGreaterThan(0);
    expect(container.querySelector('[aria-live]')).toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    expect(counter).toBeEmptyDOMElement();
    expect((final as HTMLElement).style.opacity).toBe('');
  });

  it('com "Reduzir animações", não conta', () => {
    belowTheFold();
    window.localStorage.setItem(MOTION_STORAGE_KEY, 'reduced');
    const { container } = renderWithIntl(<CountUp value={80} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeEmptyDOMElement();
  });

  it('início: contagem no Índice, sono e hábitos; nunca no peso (LEG-M06)', async () => {
    const today = '2026-10-07';
    const source = createDemoSource(generateDemoData(today, 'America/Sao_Paulo'));
    const data = await buildDashboard(source, { from: addDays(today, -29), to: today }, today);
    const { container } = renderWithIntl(<Dashboard data={data} mode="appDemo" />);
    expect(container.querySelectorAll('[data-count-up]')).toHaveLength(3);
    const body = screen.getByRole('link', { name: 'Peso' }).closest('article');
    expect(body?.querySelector('[data-count-up]')).toBeNull();
  });
});

function Revealed({ kind }: { kind: 'draw' | 'fade' }) {
  const { ref, revealProps } = useReveal<HTMLDivElement>(kind);
  return (
    <div ref={ref} data-testid="plot" {...revealProps}>
      <svg data-testid="drawing" />
    </div>
  );
}

describe('gráficos que se revelam ao entrar na tela', () => {
  it('escondido até entrar; depois revela e, no fim da transição, fica sem recorte', () => {
    renderWithIntl(<Revealed kind="draw" />);
    const plot = screen.getByTestId('plot');
    expect(plot).toHaveAttribute('data-reveal', 'draw');
    expect(plot).toHaveAttribute('data-reveal-state', 'hidden');
    act(() => {
      enter();
      vi.advanceTimersByTime(20);
    });
    expect(plot).toHaveAttribute('data-reveal-state', 'shown');
    // Transição de outro elemento dentro do gráfico não encerra a revelação; a do desenho, sim.
    fireEvent.transitionEnd(plot);
    expect(plot).toHaveAttribute('data-reveal-state', 'shown');
    fireEvent.transitionEnd(screen.getByTestId('drawing'));
    expect(plot).not.toHaveAttribute('data-reveal-state');
  });

  it('com "Reduzir animações", aparece direto', () => {
    window.localStorage.setItem(MOTION_STORAGE_KEY, 'reduced');
    renderWithIntl(<Revealed kind="fade" />);
    expect(screen.getByTestId('plot')).not.toHaveAttribute('data-reveal-state');
  });

  it('sem IntersectionObserver, aparece direto', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    renderWithIntl(<Revealed kind="draw" />);
    expect(screen.getByTestId('plot')).not.toHaveAttribute('data-reveal-state');
  });
});

describe('"Ver mais": só as semanas novas entram em sequência', () => {
  it('marca as semanas novas, na ordem, e nunca as que já estavam', () => {
    const weeks = ['2026-10-05', '2026-09-28', '2026-09-21', '2026-09-14'].map((start) => ({
      start,
      end: addDays(start, 6),
      content: <ul>{<li className="hm-row">{start}</li>}</ul>,
    }));
    const { container } = renderWithIntl(<WeeklyList weeks={weeks} />);
    expect(container.querySelectorAll('[data-enter]')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /Ver mais/ }));
    const entered = [...container.querySelectorAll<HTMLElement>('[data-enter]')];
    expect(entered).toHaveLength(2);
    expect(entered.map((s) => s.style.getPropertyValue('--hm-enter-i'))).toEqual(['0', '1']);
    expect(entered[0]).toHaveTextContent('2026-09-21');
  });
});

describe('marcar um hábito', () => {
  it('o "pulo" do ícone só vem depois do clique, nunca ao carregar', () => {
    const ui = (done: boolean) => (
      <NextIntlClientProvider locale="pt-BR" messages={messages} timeZone="America/Sao_Paulo">
        <HabitCheckButton habitId="h1" name="Alongar" day="2026-10-07" done={done} />
      </NextIntlClientProvider>
    );
    const { container, rerender } = render(ui(true));
    expect(container.querySelector('.hm-pop')).toBeNull();
    rerender(ui(false));
    fireEvent.click(screen.getByRole('button', { name: /Alongar/ }));
    // A ação grava e a página volta com o hábito feito: aí o ícone dá o "pulo".
    rerender(ui(true));
    expect(container.querySelector('.hm-pop')).not.toBeNull();
  });
});

describe('botão magnético', () => {
  it('liga só com mouse e sem "Reduzir animações"; o contêiner de fora não se move', () => {
    const { container, unmount } = renderWithIntl(
      <Magnetic>
        <button type="button">Registrar</button>
      </Magnetic>,
    );
    const outer = container.querySelector('[data-magnetic]') as HTMLElement;
    expect(outer).not.toBeNull();
    fireEvent.pointerMove(outer, { pointerType: 'mouse', clientX: 90, clientY: 90 });
    act(() => vi.advanceTimersByTime(20));
    expect(outer.style.transform).toBe('');
    unmount();

    mockMedia({ fine: false, reduced: false });
    const touch = renderWithIntl(
      <Magnetic>
        <button type="button">Registrar</button>
      </Magnetic>,
    );
    expect(touch.container.querySelector('[data-magnetic]')).toBeNull();
    touch.unmount();

    mockMedia({ fine: true, reduced: true });
    const reduced = renderWithIntl(
      <Magnetic>
        <button type="button">Registrar</button>
      </Magnetic>,
    );
    expect(reduced.container.querySelector('[data-magnetic]')).toBeNull();
  });
});
