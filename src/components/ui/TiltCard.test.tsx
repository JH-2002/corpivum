import { fireEvent, screen } from '@testing-library/react';
import { renderWithIntl } from '../../../tests/render';
import { ReduceMotionToggle } from './ReduceMotionToggle';
import { MAX_TILT_DEG, TiltCard, tiltFor } from './TiltCard';

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

function card() {
  return renderWithIntl(
    <>
      <TiltCard className="rounded-lg">
        <p>Sono</p>
      </TiltCard>
      <ReduceMotionToggle />
    </>,
  );
}

describe('cartão com inclinação (ADR-0048)', () => {
  afterEach(() => window.localStorage.clear());

  it('inclina no máximo 6° nas bordas e fica reto no centro', () => {
    expect(MAX_TILT_DEG).toBe(6);
    expect(tiltFor(0.5, 0.5)).toEqual({ rx: 0, ry: 0 });
    expect(tiltFor(1, 0)).toEqual({ rx: 6, ry: 6 });
    expect(tiltFor(0, 1)).toEqual({ rx: -6, ry: -6 });
    // Fora do cartão (arredondamento do ponteiro) não passa do limite.
    expect(tiltFor(2, -1)).toEqual({ rx: 6, ry: 6 });
  });

  it('com mouse e sem pedido de menos movimento, o efeito liga; o brilho é decorativo', () => {
    mockMedia({ fine: true, reduced: false });
    const { container } = card();
    const el = container.querySelector('[data-tilt]');
    expect(el).not.toBeNull();
    expect(el?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('Sono')).toBeVisible();
  });

  it('em tela de toque, é um cartão comum', () => {
    mockMedia({ fine: false, reduced: false });
    const { container } = card();
    expect(container.querySelector('[data-tilt]')).toBeNull();
  });

  it('com prefers-reduced-motion, é um cartão comum', () => {
    mockMedia({ fine: true, reduced: true });
    const { container } = card();
    expect(container.querySelector('[data-tilt]')).toBeNull();
  });

  it('"Reduzir animações" desliga o efeito, persiste e marca o <html>', () => {
    mockMedia({ fine: true, reduced: false });
    const { container } = card();
    const toggle = screen.getByRole('button', { name: /Reduzir animações/ });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-tilt]')).toBeNull();
    expect(window.localStorage.getItem('hm.motion')).toBe('reduced');
    expect(document.documentElement.dataset.motion).toBe('reduced');
    fireEvent.click(toggle);
    expect(container.querySelector('[data-tilt]')).not.toBeNull();
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });
});
