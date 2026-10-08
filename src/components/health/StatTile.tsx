import type { ReactNode } from 'react';
import { ConfidenceBadge, type ConfidenceLevel } from '@/components/ui/ConfidenceBadge';

/**
 * Indicador simples com selo de origem (§39): rótulo, valor (números tabulares) e detalhe opcional.
 * Todo valor exibido tem selo (CLAUDE.md regra 7).
 */
export function StatTile({
  label,
  value,
  detail,
  badge,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  badge: ConfidenceLevel;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-fg-muted">{label}</p>
        <ConfidenceBadge level={badge} />
      </div>
      <p className="tabular text-2xl font-bold">{value}</p>
      {detail ? <p className="text-sm text-fg-muted">{detail}</p> : null}
    </div>
  );
}
