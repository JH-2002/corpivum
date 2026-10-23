import type { Page } from '@playwright/test';

/**
 * Deixa a página no estado final antes do axe (9f, ADR-0055).
 * - Emula `prefers-reduced-motion`: o que espera para entrar na tela (gráficos recortados ou transparentes, números
 *   da contagem) aparece inteiro, e o axe mede o contraste de tudo, não só do que já foi rolado. A animação em si tem
 *   testes próprios, sem a emulação (`demo.spec.ts`, "movimento e interatividade").
 * - Espera não haver transição de página (`<ViewTransition>`) nem animação em curso (fora as infinitas, como o
 *   esqueleto de carregamento) e o `<title>` de volta (na transição, o Next só repõe o título no fim).
 * - Mouse fora dos cartões: um cartão inclinado sob o cursor (ADR-0048) muda a caixa medida dos alvos.
 * - Página no topo: a medida de alvo do axe dependia de onde a rolagem parou (um selo meio coberto pelo cabeçalho
 *   fixo). Fica de fora da cobertura automática o alvo coberto pelo cabeçalho no meio da rolagem (WCAG 2.5.8);
 *   o cabeçalho fixo não mudou na 9f.
 */
export async function settled(page: Page): Promise<Page> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForFunction(
    () =>
      document.title !== '' &&
      document.querySelector('[data-reveal-state]') === null &&
      [...document.querySelectorAll<HTMLElement>('[data-count-up] > span:first-child')].every(
        (el) => el.style.opacity === '',
      ) &&
      document
        .getAnimations()
        .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity) &&
      !document.documentElement.matches(':active-view-transition'),
  );
  return page;
}
