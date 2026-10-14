'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { HoloLoading } from './HoloLoading';
import { useWebGLSupport } from './hooks';

/** Espera enquanto o chunk do 3D carrega (§34: carregando), no mesmo estilo do carregamento do modelo. */
export function SceneLoading() {
  return (
    <div className="relative h-full w-full">
      <HoloLoading />
    </div>
  );
}

/**
 * Cenas 3D carregadas sob demanda (ADR-0026, §41): o three.js fica num chunk próprio, baixado só quando
 * a tela do twin mostra o modelo, nunca no dashboard. Este é o único ponto que importa `./scene`.
 */
export const LazyBodyScene = dynamic(() => import('./scene/BodyScene').then((m) => m.BodyScene), {
  ssr: false,
  loading: SceneLoading,
});

/**
 * Pré-carregamento (ADR-0028, revisão de carregamento): assim que a tela do twin abre num navegador com
 * WebGL, começa a baixar o chunk do 3D, os dois `.glb` (sempre os dois: o servidor não sabe qual corpo a
 * pessoa vê, OI-24(e)) e o decodificador meshopt, em paralelo com a hidratação. Mesmo cache dos pedidos
 * da cena (por arquivo, sem cookie e com `Cache-Control: immutable`). Sem WebGL, nada é baixado.
 */
export function usePreloadBodyScene(): void {
  const support = useWebGLSupport();
  useEffect(() => {
    if (support !== 'yes') return;
    void import('./scene/BodyScene').catch(() => undefined);
    // A falha aparece depois, na própria cena (fallback real), não aqui.
    void import('./scene/assets').then((m) => m.preloadAllBodyModels()).catch(() => undefined);
  }, [support]);
}
