'use client';

/**
 * Foco movido por código (título da página, seção do formulário, tela da apresentação) sem moldura para quem
 * usa mouse ou toque (9b). A heurística do `:focus-visible` dos navegadores varia no foco por script; aqui a
 * última interação decide: depois de tecla, o anel de foco aparece como sempre (WCAG 2.4.7); depois de
 * ponteiro, o elemento ganha `data-focus-quiet` até perder o foco, e o CSS tira o contorno só nesse caso.
 */
let lastInput: 'keyboard' | 'pointer' = 'pointer';
let listening = false;

function listen(): void {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener(
    'keydown',
    (event) => {
      // Modificadores sozinhos (ex.: Ctrl para copiar) não mudam a forma de navegar.
      if (!['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) lastInput = 'keyboard';
    },
    true,
  );
  document.addEventListener('pointerdown', () => (lastInput = 'pointer'), true);
}

/** Registra os ouvintes de interação o quanto antes (chamado pelo shell ao montar). */
export function trackInputModality(): void {
  listen();
}

/** A última interação foi clique ou toque (e não tecla). */
export function lastInputWasPointer(): boolean {
  listen();
  return lastInput === 'pointer';
}

export function focusProgrammatically(
  element: HTMLElement | null | undefined,
  options: FocusOptions = {},
): void {
  if (!element) return;
  listen();
  if (lastInput === 'pointer') {
    element.setAttribute('data-focus-quiet', '');
    element.addEventListener('blur', () => element.removeAttribute('data-focus-quiet'), {
      once: true,
    });
  } else {
    element.removeAttribute('data-focus-quiet');
  }
  element.focus(options);
}
