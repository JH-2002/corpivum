'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { toIsoDate } from './period';

/**
 * Preferências de interface no navegador (tema, período da sessão). Nunca guardar dado de saúde aqui.
 * O acesso ao storage pode falhar (modo privado, bloqueio): tudo em try/catch, com fallback.
 */
type StorageKind = 'local' | 'session';

const CHANGE_EVENT = 'hm:storage';
/** Fallback quando o storage do navegador está indisponível. */
const memory = new Map<string, string>();

function storageOf(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

/** Valor bruto do storage; `null` no servidor e na primeira renderização de hidratação. */
export function useStoredValue(
  kind: StorageKind,
  key: string,
): [string | null, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return storageOf(kind)?.getItem(key) ?? memory.get(key) ?? null;
      } catch {
        return memory.get(key) ?? null;
      }
    },
    () => null,
  );

  const setValue = useCallback(
    (next: string) => {
      memory.set(key, next);
      try {
        storageOf(kind)?.setItem(key, next);
      } catch {
        // Sem storage: a preferência vale só até recarregar a página.
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [kind, key],
  );

  return [value, setValue];
}

const noopSubscribe = () => () => {};

/** Data local de hoje (`YYYY-MM-DD`); `null` no servidor, para não divergir na hidratação. */
export function useToday(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => toIsoDate(new Date()),
    () => null,
  );
}

/** `true` só no cliente, após a hidratação. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
