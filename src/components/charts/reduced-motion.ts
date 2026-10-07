'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(callback: () => void) {
  const media = window.matchMedia?.(QUERY);
  media?.addEventListener('change', callback);
  return () => media?.removeEventListener('change', callback);
}

/** `prefers-reduced-motion` (WCAG 2.3.3): gráficos sem animação. No servidor, assume reduzido. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(QUERY).matches ?? false,
    () => true,
  );
}
