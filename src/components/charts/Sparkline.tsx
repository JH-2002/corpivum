'use client';

import dynamic from 'next/dynamic';
import type { RevealKind } from '@/lib/motion/reveal';
import { paddedDomain } from './domain';
import { hasValues } from './format';

/** O recharts vem num chunk próprio, depois da hidratação (§41, orçamento da 7d); o espaço fica reservado. */
const LazySparklinePlot = dynamic(() => import('./SparklinePlot').then((m) => m.SparklinePlot), {
  ssr: false,
});

/**
 * Mini-gráfico dos cards (§12). Decorativo (`aria-hidden`): o card traz o valor e a variação em texto.
 * Sem nenhum valor, não desenha nada (o card mostra "sem registros"). `minSpan`: faixa mínima do eixo (medidas do
 * corpo, ±2 kg ou cm), para variação pequena não parecer grande (LEG-M06).
 */
export function Sparkline({
  data,
  color,
  minSpan,
  entrance = 'draw',
}: {
  data: ReadonlyArray<{ day: string; value: number | null }>;
  color: string;
  minSpan?: number;
  /** Entrada ao aparecer (9f): `fade` nas medidas do corpo (LEG-M06). */
  entrance?: RevealKind;
}) {
  if (!hasValues(data, ['value'])) return null;
  const domain =
    minSpan !== undefined
      ? paddedDomain(
          data.map((p) => p.value),
          { minSpan },
        )
      : undefined;
  return (
    <div aria-hidden="true" className="h-10 w-full">
      <LazySparklinePlot data={data} color={color} domain={domain} entrance={entrance} />
    </div>
  );
}
