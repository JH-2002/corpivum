'use client';

import { BadgeCheck, Calculator, FlaskConical, Lightbulb, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type ComponentType } from 'react';
import { cn } from '@/lib/cn';

/** Níveis de confiabilidade obrigatórios em todo dado exibido (§39, CLAUDE.md regra 7). */
export const CONFIDENCE_LEVELS = ['MEDIDO', 'INFORMADO', 'ESTIMADO', 'INFERIDO', 'DEMO'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

const STYLES: Record<
  ConfidenceLevel,
  { icon: ComponentType<{ className?: string }>; className: string }
> = {
  MEDIDO: { icon: BadgeCheck, className: 'bg-info-soft text-info' },
  INFORMADO: { icon: Pencil, className: 'bg-primary-soft text-primary-soft-fg' },
  ESTIMADO: { icon: Calculator, className: 'bg-secondary-soft text-secondary-soft-fg' },
  INFERIDO: { icon: Lightbulb, className: 'bg-warning-soft text-warning' },
  DEMO: { icon: FlaskConical, className: 'bg-surface-muted text-fg' },
};

/**
 * Selo de origem do dado. Texto + ícone (cor nunca é o único canal) e dica acessível
 * exibida em foco ou hover, que fecha com Esc (WCAG 1.4.13).
 * DEMO é discreto por padrão: só o ícone (o nome acessível e a dica dizem "Demo"), porque a página inteira já
 * se anuncia como demonstração (pílula no cabeçalho e faixa). Continua em cada dado (regra 7), com alvo de 24 px.
 * `full` mostra o texto mesmo no DEMO.
 */
export function ConfidenceBadge({
  level,
  full = false,
}: {
  level: ConfidenceLevel;
  full?: boolean;
}) {
  const t = useTranslations('badges');
  // A dica aparece por CSS em hover/foco (e continua visível com o ponteiro sobre ela);
  // o estado só registra o fechamento por Esc até o próximo foco.
  const [dismissed, setDismissed] = useState(false);
  const hintId = useId();
  const { icon: Icon, className } = STYLES[level];
  const compact = level === 'DEMO' && !full;

  return (
    <span className="group relative inline-flex" data-dismissed={dismissed || undefined}>
      <button
        type="button"
        aria-describedby={hintId}
        aria-label={t('label', { badge: t(level) })}
        onFocus={() => setDismissed(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDismissed(true);
        }}
        data-compact={compact || undefined}
        className={cn(
          'inline-flex min-h-6 items-center rounded-full text-xs font-semibold tracking-wide uppercase',
          compact ? 'min-w-6 justify-center text-fg-muted' : cn('gap-1 px-2', className),
        )}
      >
        <Icon className={compact ? 'size-4' : 'size-3.5'} aria-hidden="true" />
        {compact ? null : t(level)}
      </button>
      <span
        id={hintId}
        role="tooltip"
        className={cn(
          'invisible absolute top-full right-0 z-20 w-56 max-w-[calc(100vw-2rem)] pt-1',
          'group-focus-within:visible group-hover:visible group-data-dismissed:invisible',
        )}
      >
        <span className="block rounded-md border border-border bg-surface p-2 text-xs font-normal text-fg normal-case shadow-md">
          {t(`${level}_hint`)}
        </span>
      </span>
    </span>
  );
}
