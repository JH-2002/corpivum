'use client';

import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import { hasValues } from './format';
import { usePrefersReducedMotion } from './reduced-motion';

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
  const reduced = usePrefersReducedMotion();
  if (!hasValues(data, ['value'])) return null;
  return (
    <div aria-hidden="true" className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={[...data]}
          margin={{ top: 4, right: 2, bottom: 4, left: 2 }}
          accessibilityLayer={false}
        >
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Line
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={!reduced}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
