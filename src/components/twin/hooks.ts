'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => {};

let webgl: boolean | undefined;

/** Testa uma vez se o navegador cria contexto WebGL. Sem WebGL, o twin mostra a versão 2D. */
function detectWebGL(): boolean {
  if (webgl !== undefined) return webgl;
  try {
    const canvas = document.createElement('canvas');
    webgl = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    webgl = false;
  }
  return webgl;
}

/** `pending` no servidor e na hidratação; depois `yes`/`no`. */
export function useWebGLSupport(): 'pending' | 'yes' | 'no' {
  return useSyncExternalStore(
    noop,
    () => (detectWebGL() ? 'yes' : 'no'),
    () => 'pending',
  );
}

/** Media query no cliente (no servidor, `false`). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const media = window.matchMedia?.(query);
      media?.addEventListener('change', callback);
      return () => media?.removeEventListener('change', callback);
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}

/** Tela estreita (< 640px): 3D simplificado e comparação com um modelo por vez (§42). */
export function useCompact(): boolean {
  return useMediaQuery('(max-width: 639px)');
}

// Tema único escuro (ADR-0046): os tokens não mudam depois de carregados, não há o que observar.
const subscribeTheme = () => () => {};

/**
 * Cores dos tokens do tema (`--hm-*`) para o three.js, que não lê variáveis CSS. Devolve `fallback` no
 * servidor.
 */
export function useTokenColor(token: `--hm-${string}`, fallback: string): string {
  return useThemeToken(token, fallback);
}

/** Valor bruto de um token do tema (ex.: `--hm-holo-blend`). */
export function useThemeToken(token: `--hm-${string}`, fallback: string): string {
  return useSyncExternalStore(
    subscribeTheme,
    () => getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback,
    () => fallback,
  );
}
