'use client';

import { useLayoutEffect, useRef, type TransitionEvent } from 'react';
import { useReducedMotion } from './motion';

export type RevealKind = 'draw' | 'fade' | 'grow';

const STATE_ATTR = 'data-reveal-state';

/**
 * Gráfico que se revela ao entrar na tela (9f, ADR-0055): `draw` abre da esquerda para a direita (`clip-path`),
 * `fade` só esmaece (corpo, alimentação e relatórios: nada que chame atenção para medidas ou comida, LEG-M06/M07);
 * `grow` enche a barra das metas da esquerda para a direita.
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
    // A barra das metas vem do servidor já desenhada: se já está na tela, fica como está (esconder e reencher
    // piscaria). Os gráficos montam só no cliente, então se revelam mesmo na tela.
    const fromServer = kind === 'grow';
    if (!fromServer) el.setAttribute(STATE_ATTR, 'hidden');
    let frame = 0;
    let first = true;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (fromServer && first) {
          first = false;
          if (visible) observer.disconnect();
          else el.setAttribute(STATE_ATTR, 'hidden');
          return;
        }
        if (!visible) return;
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
  }, [reduced, kind]);

  function onTransitionEnd(event: TransitionEvent<T>) {
    // Fim da revelação: sem `clip-path`, a dica do gráfico não fica recortada.
    if (event.target === event.currentTarget.firstElementChild) {
      event.currentTarget.removeAttribute(STATE_ATTR);
    }
  }

  return { ref, revealProps: { 'data-reveal': kind, onTransitionEnd } };
}
