'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useStoredValue } from '@/lib/browser-store';
import { MOTION_REDUCED as REDUCED, MOTION_STORAGE_KEY } from './keys';

export { MOTION_STORAGE_KEY };

function mediaStore(query: string, serverValue: boolean) {
  const subscribe = (callback: () => void) => {
    const media = window.matchMedia?.(query);
    media?.addEventListener('change', callback);
    return () => media?.removeEventListener('change', callback);
  };
  return () =>
    useSyncExternalStore(
      subscribe,
      () => window.matchMedia?.(query).matches ?? false,
      () => serverValue,
    );
}

/** `prefers-reduced-motion` do sistema. No servidor, assume reduzido (nada anima antes de hidratar). */
const useSystemReducedMotion = mediaStore('(prefers-reduced-motion: reduce)', true);

/** Mouse ou trackpad: `(hover: hover) and (pointer: fine)`. Toque não conta. No servidor, `false`. */
export const useFinePointer = mediaStore('(hover: hover) and (pointer: fine)', false);

/**
 * Movimento desligado pelo sistema (`prefers-reduced-motion`) ou pela opção do app. Sem efeitos colaterais: serve
 * a gráficos, tour e twin, que antes só olhavam a preferência do sistema (9f). No servidor, reduzido.
 */
export function useReducedMotion(): boolean {
  const system = useSystemReducedMotion();
  const [stored] = useStoredValue('local', MOTION_STORAGE_KEY);
  return system || stored === REDUCED;
}

export interface MotionPreference {
  /** Movimento desligado: pelo sistema ou pela opção do app. */
  reduced: boolean;
  /** A opção "Reduzir animações" do app está ligada. */
  userReduced: boolean;
  setUserReduced: (reduced: boolean) => void;
}

/**
 * Preferência de movimento: une o `prefers-reduced-motion` do sistema e a opção do app, guardada no
 * `localStorage` (`hm.motion`). Marca `<html data-motion="reduced">` para o CSS valer igual à mídia do sistema.
 */
export function useMotionPreference(): MotionPreference {
  const system = useSystemReducedMotion();
  const [stored, setStored] = useStoredValue('local', MOTION_STORAGE_KEY);
  const userReduced = stored === REDUCED;

  useEffect(() => {
    if (userReduced) document.documentElement.dataset.motion = REDUCED;
    else delete document.documentElement.dataset.motion;
  }, [userReduced]);

  const setUserReduced = useCallback(
    (reduced: boolean) => setStored(reduced ? REDUCED : 'full'),
    [setStored],
  );
  return { reduced: system || userReduced, userReduced, setUserReduced };
}
