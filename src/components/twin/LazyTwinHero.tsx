'use client';

import { Info, Orbit } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { HoloLoading } from './HoloLoading';
import { useIdleStart } from './useIdleStart';

/**
 * Esqueleto do twin do início no HTML (ADR-0049): mesmo cartão, título e área do modelo do `TwinHero`, com a
 * silhueta holográfica do carregamento. O componente interativo chega num chunk próprio depois da carga
 * (orçamento de JS de entrada, `perf-budget.json`, e do "interativo") e assume no mesmo lugar, sem "pulo".
 */
export function TwinHeroPlaceholder() {
  const t = useTranslations('twin.hero');
  const td = useTranslations('disclaimer');
  return (
    <section
      aria-labelledby="twin-hero-title"
      aria-busy="true"
      // Mesmo alvo do tour do `TwinHero` (9d): o tour abre antes do chunk chegar e não pula o passo do twin.
      data-tour="twin-hero"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <div>
        <h2 id="twin-hero-title" className="flex items-center gap-2 text-base font-semibold">
          <Orbit className="size-5 text-primary" aria-hidden="true" />
          {t('title')}
        </h2>
        <p className="text-sm text-fg-muted">{t('subtitle')}</p>
      </div>
      <p className="flex gap-2 text-sm text-fg-muted">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        {td('bodyModel')}
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="relative h-[min(62vh,640px)] min-h-[340px] overflow-hidden rounded-lg border border-border bg-surface">
          <HoloLoading pulse={false} />
        </div>
        <div aria-hidden="true" className="hidden min-h-64 lg:block" />
      </div>
    </section>
  );
}

const TwinHeroChunk = dynamic(() => import('./TwinHero').then((m) => m.TwinHero), {
  ssr: false,
  loading: TwinHeroPlaceholder,
});

/** O chunk do twin interativo só é pedido depois da carga e de um tempo ocioso; até lá, o esqueleto. */
export function LazyTwinHero(props: ComponentProps<typeof TwinHeroChunk>) {
  const started = useIdleStart(true);
  return started ? <TwinHeroChunk {...props} /> : <TwinHeroPlaceholder />;
}
