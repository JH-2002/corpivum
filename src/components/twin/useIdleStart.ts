'use client';

import { useEffect, useState } from 'react';

/**
 * `true` só depois de a página ficar interativa (evento `load` + tempo ocioso), para o twin do início não
 * disputar a hidratação nem o primeiro toque (orçamento de 2,5 s, ADR-0049). Usado duas vezes: para baixar o
 * próprio twin interativo e, dentro dele, a cena 3D. Sem `requestIdleCallback` (Safari), um atraso curto.
 */
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
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
    return () => {
      window.removeEventListener('load', go);
      cancel();
    };
  }, [enabled, started]);
  return started;
}
