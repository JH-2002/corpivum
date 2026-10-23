'use client';

import { useReveal } from '@/lib/motion/reveal';

/**
 * Barra de progresso de meta (hábito, sono, atividade; peso e calorias não têm barra, LEG-M06/M07). Enche ao entrar
 * na tela (9f, ADR-0055, `useReveal('grow')`): só depois da hidratação e nunca com "Reduzir animações".
 */
export function ProgressTrack({
  percent,
  label,
  valueText,
}: {
  percent: number;
  label: string;
  valueText: string;
}) {
  const { ref, revealProps } = useReveal<HTMLDivElement>('grow');
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText}
      aria-label={label}
      className="h-3 w-full overflow-hidden rounded-full border border-border-strong bg-surface-muted"
      {...revealProps}
    >
      <div className="h-full origin-left bg-primary" style={{ width: `${percent}%` }} />
    </div>
  );
}
