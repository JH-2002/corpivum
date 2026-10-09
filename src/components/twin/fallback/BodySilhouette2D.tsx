'use client';

import type { BodyRegion, BodyShape } from '@/modules/twin';
import { bodyLayout, nearestView, type ProfilePoint } from '../layout';

/** Margem do desenho (m) e altura máxima desenhada (igual ao limite do 3D). */
const PAD = 0.1;
const MAX_H = 2.2;

/**
 * Versão 2D do corpo (sem WebGL, ADR-0026): silhueta em SVG com a MESMA forma do 3D (`bodyLayout`).
 * Frente e costas mostram a largura; o lado mostra a profundidade. Clique numa região a seleciona; o
 * teclado usa a lista de regiões ao lado. Decorativo para leitor de tela (a informação está em texto).
 */
export function BodySilhouette2D({
  shape,
  angle,
  selected,
  onSelect,
}: {
  shape: BodyShape;
  angle: number;
  selected: BodyRegion | null;
  onSelect: (region: BodyRegion) => void;
}) {
  const layout = bodyLayout(shape);
  const side = nearestView(angle) === 'side';
  const depth = side ? layout.depth : 1;
  const width = 1.4;
  const cx = width / 2;
  // SVG cresce para baixo: y_svg = topo − y.
  const top = MAX_H + PAD;
  const Y = (y: number) => top - y;
  const missing = new Set(shape.missing);

  const band = (points: readonly ProfilePoint[]) => {
    const right = points.map(([r, y]) => `${cx + r * depth},${Y(y)}`);
    const left = [...points].reverse().map(([r, y]) => `${cx - r * depth},${Y(y)}`);
    return [...right, ...left].join(' ');
  };
  const regionProps = (region: BodyRegion) => ({
    onClick: () => onSelect(region),
    className: 'cursor-pointer',
    fill: region === selected ? 'var(--hm-primary)' : 'var(--hm-neutral-400)',
    fillOpacity: missing.has(region) && region !== selected ? 0.55 : 1,
    stroke: 'var(--hm-border-strong)',
    strokeWidth: 0.006,
    'data-region': region,
  });
  const leg = (x: number) => {
    const { top: t, bottom: b, rTop, rBottom } = layout.leg;
    return `${x - rTop},${Y(t)} ${x + rTop},${Y(t)} ${x + rBottom},${Y(b)} ${x - rBottom},${Y(b)}`;
  };
  const legX = side ? 0 : layout.leg.x;
  const armX = side ? 0 : layout.arm.x;

  return (
    <svg
      viewBox={`0 0 ${width} ${top + PAD}`}
      className="h-full w-full"
      aria-hidden
      data-testid="body-2d"
    >
      {(side ? [0] : [-1, 1]).map((s) => (
        <polygon key={`leg${s}`} points={leg(cx + s * legX)} {...regionProps('thigh')} />
      ))}
      {(['hip', 'waist', 'chest'] as const).map((b) => (
        <polygon key={b} points={band(layout.torso[b])} {...regionProps(b)} />
      ))}
      {(side ? [0] : [-1, 1]).map((s) => (
        <rect
          key={`arm${s}`}
          x={cx + s * armX - layout.arm.r}
          y={Y(layout.arm.top + layout.arm.r)}
          width={layout.arm.r * 2}
          height={layout.arm.length + layout.arm.r * 2}
          rx={layout.arm.r}
          {...regionProps('arm')}
        />
      ))}
      <rect
        x={cx - layout.neck.r}
        y={Y(layout.neck.top)}
        width={layout.neck.r * 2}
        height={layout.neck.top - layout.neck.bottom}
        fill="var(--hm-neutral-400)"
      />
      <ellipse
        cx={cx}
        cy={Y(layout.head.y)}
        rx={layout.head.r * (side ? 0.95 : 0.85)}
        ry={layout.head.r}
        fill="var(--hm-neutral-400)"
        stroke="var(--hm-border-strong)"
        strokeWidth={0.006}
      />
    </svg>
  );
}
