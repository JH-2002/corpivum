'use client';

import { useEffect, useState } from 'react';

/** Espera pelo modelo 3D a partir da qual o twin oferece a versão 2D (ADR-0028). */
export const SLOW_LOAD_MS = 20_000;

/**
 * `true` quando a espera identificada por `key` já dura `ms`. `key = null`: sem espera (modelo pronto, erro,
 * contexto perdido ou sem escolha de modelo). Trocar a chave (outro arquivo) recomeça a contagem.
 */
export function useSlowLoad(key: string | null, ms: number = SLOW_LOAD_MS): boolean {
  const [slowKey, setSlowKey] = useState<string | null>(null);
  useEffect(() => {
    if (key === null) return;
    const timer = setTimeout(() => setSlowKey(key), ms);
    return () => {
      clearTimeout(timer);
      // Fim desta espera: voltar ao mesmo arquivo depois recomeça do zero.
      setSlowKey(null);
    };
  }, [key, ms]);
  return key !== null && slowKey === key;
}
