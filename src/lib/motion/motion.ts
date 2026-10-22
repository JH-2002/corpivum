'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useStoredValue } from '@/lib/browser-store';

/** Opção "Reduzir animações" (ADR-0048): só uma preferência de interface, sem dado pessoal. */
export const MOTION_STORAGE_KEY = 'hm.motion';
const REDUCED = 'reduced';

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
