'use client';

import { useLayoutEffect, useRef, type TransitionEvent } from 'react';
import { useReducedMotion } from './motion';

export type RevealKind = 'draw' | 'fade';

const STATE_ATTR = 'data-reveal-state';

/**
 * Gráfico que se revela ao entrar na tela (9f, ADR-0055): `draw` abre da esquerda para a direita (`clip-path`),
 * `fade` só esmaece (corpo, alimentação e relatórios: nada que chame atenção para medidas ou comida, LEG-M06/M07).
 * O CSS fica em `globals.css` (`[data-reveal]`). Sem IntersectionObserver ou com "Reduzir animações", o gráfico
 * aparece direto. O estado vai direto no atributo do elemento, antes da pintura (layout effect), sem renderizar de
 * novo; o recharts não anima (`isAnimationActive={false}`), então o custo é só a transição do navegador.
 * O recorte e o esmaecimento vão no primeiro filho: o IntersectionObserver do Chromium conta o `clip-path` do
 * próprio alvo, e o gráfico recortado nunca "entraria" na tela.
 */
export function useReveal<T extends HTMLElement>(kind: RevealKind) {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      el.removeAttribute(STATE_ATTR);
      return;
    }
    el.setAttribute(STATE_ATTR, 'hidden');
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        // Um quadro depois de esconder, para o navegador ter o ponto de partida da transição.
        frame = requestAnimationFrame(() => el.setAttribute(STATE_ATTR, 'shown'));
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      el.removeAttribute(STATE_ATTR);
    };
  }, [reduced]);

  function onTransitionEnd(event: TransitionEvent<T>) {
    // Fim da revelação: sem `clip-path`, a dica do gráfico não fica recortada.
    if (event.target === event.currentTarget.firstElementChild) {
      event.currentTarget.removeAttribute(STATE_ATTR);
    }
  }

  return { ref, revealProps: { 'data-reveal': kind, onTransitionEnd } };
}
