import type { Page } from '@playwright/test';

/**
 * Espera a página assentar antes do axe (9f, ADR-0055): sem transição de página (`<ViewTransition>`) nem animação em
 * curso (fora as infinitas) e com o `<title>` de volta (durante a transição o Next troca o título só no fim). No meio de uma entrada,
 * a opacidade parcial muda o contraste medido e elementos em movimento podem se sobrepor.
 */
export async function settled(page: Page): Promise<Page> {
  // Mouse fora dos cartões: um cartão inclinado sob o cursor (ADR-0048) muda a caixa medida dos alvos. E a página no
  // topo: a medida de alvo do axe depende de onde a rolagem parou (um selo meio coberto pelo cabeçalho fixo).
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForFunction(
    () =>
      document.title !== '' &&
      // Animações sem fim (esqueleto de carregamento, holograma) não contam: nunca terminam.
      document
        .getAnimations()
        .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity) &&
      !document.documentElement.matches(':active-view-transition'),
  );
  return page;
}
