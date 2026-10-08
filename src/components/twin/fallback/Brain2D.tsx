'use client';

import { useId } from 'react';
import type { BrainRegion } from '@/modules/twin';

/** Divisão estilizada da vista lateral (frente à esquerda), recortada pelo contorno do cérebro. */
/** Mesmos tons alternados do 3D: só separam regiões vizinhas. */
const ALT_TONE: ReadonlySet<BrainRegion> = new Set(['parietal', 'temporal', 'brainstem']);

const LOBE_POLYGONS: Record<Exclude<BrainRegion, 'cerebellum' | 'brainstem'>, string> = {
  frontal: '0,0 88,0 96,68 60,76 0,76',
  parietal: '88,0 150,0 142,58 96,68',
  occipital: '150,0 200,0 200,120 152,96 142,58',
  temporal: '0,76 60,76 96,68 142,58 152,96 124,130 0,130',
};

/**
 * Versão 2D do cérebro educativo (sem WebGL, LEG-M05): vista lateral estilizada, igual para todas as
 * pessoas. Clique numa região a seleciona; o teclado usa a lista de regiões.
 */
export function Brain2D({
  selected,
  onSelect,
}: {
  selected: BrainRegion | null;
  onSelect: (region: BrainRegion) => void;
}) {
  const clip = `brain-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const props = (region: BrainRegion) => ({
    onClick: () => onSelect(region),
    className: 'cursor-pointer',
    fill:
      region === selected
        ? 'var(--hm-primary)'
        : ALT_TONE.has(region)
          ? 'var(--hm-neutral-300)'
          : 'var(--hm-neutral-400)',
    stroke: 'var(--hm-border-strong)',
    strokeWidth: 1,
    'data-region': region,
  });
  return (
    <svg viewBox="-10 -10 220 182" className="h-full w-full" aria-hidden data-testid="brain-2d">
      <defs>
        <clipPath id={clip}>
          <ellipse cx="100" cy="62" rx="92" ry="60" />
        </clipPath>
      </defs>
      <path d="M112 110 L128 110 L124 162 L108 162 Z" {...props('brainstem')} />
      <ellipse cx="146" cy="128" rx="32" ry="17" {...props('cerebellum')} />
      <g clipPath={`url(#${clip})`}>
        {(Object.keys(LOBE_POLYGONS) as Array<keyof typeof LOBE_POLYGONS>).map((lobe) => (
          <polygon key={lobe} points={LOBE_POLYGONS[lobe]} {...props(lobe)} />
        ))}
      </g>
      <ellipse
        cx="100"
        cy="62"
        rx="92"
        ry="60"
        fill="none"
        stroke="var(--hm-border-strong)"
        strokeWidth={1.5}
        pointerEvents="none"
      />
    </svg>
  );
}
