'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

/** Esqueleto enquanto o chunk do 3D carrega (§34: carregando). */
export function SceneLoading() {
  const t = useTranslations('twin.viewer');
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-3/4 w-1/3 animate-pulse rounded-full bg-surface-muted motion-reduce:animate-none" />
      <span className="sr-only">{t('loading')}</span>
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

export const LazyBrainScene = dynamic(
  () => import('./scene/BrainScene').then((m) => m.BrainScene),
  { ssr: false, loading: SceneLoading },
);
