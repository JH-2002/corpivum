'use client';

import { useEffect, useState } from 'react';

/**
 * `true` só depois de a página ficar interativa (evento `load` + tempo ocioso), para o twin do início não
 * disputar a hidratação nem o primeiro toque (orçamento de 2,5 s, ADR-0049). Usado duas vezes: para baixar o
 * próprio twin interativo e, dentro dele, a cena 3D. Sem `requestIdleCallback` (Safari), um atraso curto.
 */
/** Folga depois do evento `load` antes de procurar tempo ocioso (ms). */
export const AFTER_LOAD_MS = 1200;

export function useIdleStart(enabled: boolean): boolean {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!enabled || started) return;
    let cancel = () => {};
    const go = () => {
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(() => setStarted(true), { timeout: 2000 });
        cancel = () => window.cancelIdleCallback(id);
      } else {
        const id = window.setTimeout(() => setStarted(true), 300);
        cancel = () => window.clearTimeout(id);
      }
    };
    // Uma folga depois do `load`: no celular lento a hidratação ainda termina por volta dele, e o trabalho do 3D
    // (baixar e interpretar o three.js) caía em cima do primeiro toque (medido na CI, ADR-0049).
    let wait = 0;
    const afterLoad = () => {
      wait = window.setTimeout(go, AFTER_LOAD_MS);
    };
    if (document.readyState === 'complete') afterLoad();
    else window.addEventListener('load', afterLoad, { once: true });
    return () => {
      window.removeEventListener('load', afterLoad);
      window.clearTimeout(wait);
      cancel();
    };
  }, [enabled, started]);
  return started;
}
