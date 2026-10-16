'use client';

import dynamic from 'next/dynamic';
import { hasValues } from './format';
import { useAfterIdle } from './idle';

/** O recharts vem num chunk próprio, depois da carga e com o navegador ocioso (§41, `idle.ts`); o espaço fica reservado. */
const LazySparklinePlot = dynamic(() => import('./SparklinePlot').then((m) => m.SparklinePlot), {
  ssr: false,
});

/**
 * Mini-gráfico dos cards (§12). Decorativo (`aria-hidden`): o card traz o valor e a variação em texto.
 * Sem nenhum valor, não desenha nada (o card mostra "sem registros").
 */
export function Sparkline({
  data,
  color,
}: {
  data: ReadonlyArray<{ day: string; value: number | null }>;
  color: string;
}) {
  const idle = useAfterIdle();
  if (!hasValues(data, ['value'])) return null;
  return (
    <div aria-hidden="true" className="h-10 w-full">
      {idle ? <LazySparklinePlot data={data} color={color} /> : null}
    </div>
  );
}
