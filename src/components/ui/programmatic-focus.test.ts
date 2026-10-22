import {
  focusProgrammatically,
  lastInputWasPointer,
  trackInputModality,
} from './programmatic-focus';

function target(): HTMLElement {
  const el = document.createElement('h1');
  el.tabIndex = -1;
  document.body.append(el);
  return el;
}

describe('foco por código sem moldura depois de clique (9b)', () => {
  beforeAll(() => trackInputModality());
  afterEach(() => document.body.replaceChildren());

  it('depois de clique ou toque, marca o alvo como "quieto" até ele perder o foco', () => {
    document.dispatchEvent(new Event('pointerdown'));
    const el = target();
    focusProgrammatically(el);
    expect(document.activeElement).toBe(el);
    expect(lastInputWasPointer()).toBe(true);
    expect(el).toHaveAttribute('data-focus-quiet');
    el.blur();
    expect(el).not.toHaveAttribute('data-focus-quiet');
  });

  it('depois de tecla, o anel de foco continua (sem a marca)', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    const el = target();
    focusProgrammatically(el);
    expect(document.activeElement).toBe(el);
    expect(lastInputWasPointer()).toBe(false);
    expect(el).not.toHaveAttribute('data-focus-quiet');
  });

  it('modificador sozinho não conta como navegação por teclado', () => {
    document.dispatchEvent(new Event('pointerdown'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control' }));
    expect(lastInputWasPointer()).toBe(true);
  });
});
