'use client';

import { useSyncExternalStore } from 'react';

/**
 * Os desenhos dos gráficos (recharts, ~119 KiB gzip) só começam a baixar depois que a página carregou e o navegador
 * ficou ocioso (§41, 7d-P1). Antes, o chunk era pedido durante a hidratação e disputava rede e CPU com o JS da
 * tela: na CI, metade das cargas do dashboard levava ~1 s a mais para ficar interativa. Um só sinal para a página
 * inteira; título, selo, legenda e tabela alternativa não dependem dele.
 */
let ready = false;
const listeners = new Set<() => void>();
let scheduled = false;

function markReady() {
  ready = true;
  for (const listener of listeners) listener();
  listeners.clear();
}

function schedule() {
  if (scheduled || typeof window === 'undefined') return;
  scheduled = true;
  const whenIdle = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(markReady, { timeout: 2000 });
    else setTimeout(markReady, 200);
  };
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle, { once: true });
}

function subscribe(listener: () => void) {
  if (ready) return () => undefined;
  listeners.add(listener);
  schedule();
  return () => listeners.delete(listener);
}

/** `true` depois da carga e do primeiro momento ocioso do navegador (no servidor, sempre `false`). */
export function useAfterIdle(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => ready,
    () => false,
  );
}
