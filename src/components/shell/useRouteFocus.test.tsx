import { render } from '@testing-library/react';
import { useRef } from 'react';
import { useRouteFocus } from './useRouteFocus';

const nav = vi.hoisted(() => ({ pathname: '/inicio' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

function Title() {
  const ref = useRef<HTMLHeadingElement>(null);
  useRouteFocus(ref);
  return (
    <h1 ref={ref} tabIndex={-1}>
      Título
    </h1>
  );
}

describe('foco no título na troca de rota (9b)', () => {
  afterEach(() => {
    nav.pathname = '/inicio';
    document.body.replaceChildren();
  });

  it('não mexe no foco na primeira carga e foca o título quando a rota muda', () => {
    const { rerender, getByRole } = render(<Title />);
    expect(document.activeElement).toBe(document.body);
    nav.pathname = '/sono';
    rerender(<Title />);
    expect(document.activeElement).toBe(getByRole('heading'));
  });

  it('com um diálogo aberto (ex.: registro rápido), deixa o foco com ele', () => {
    const { rerender } = render(<Title />);
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    nav.pathname = '/corpo';
    rerender(<Title />);
    expect(document.activeElement).toBe(document.body);
  });
});
