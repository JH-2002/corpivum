'use client';

import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import { usePrefersReducedMotion } from './reduced-motion';

/** Desenho do `Sparkline` com o recharts, carregado sob demanda (§41). */
export function SparklinePlot({
  data,
  color,
  domain,
}: {
  data: ReadonlyArray<{ day: string; value: number | null }>;
  color: string;
  domain?: [number, number];
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={[...data]}
        margin={{ top: 4, right: 2, bottom: 4, left: 2 }}
        accessibilityLayer={false}
      >
        <YAxis hide domain={domain ?? ['dataMin', 'dataMax']} />
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
  );
}
