import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * Utilitário único do modo privacidade (ADR-0035): no lugar do valor do corpo (peso, medida, altura,
 * calorias), "oculto". Serve a Server e Client Components. O valor só deve chegar aqui quando `hidden` é
 * falso: no modo privacidade o servidor já omite os números dos dados (`src/modules/health/mask.ts`).
 */
export function maskBodyValue(hidden: boolean, value: string, hiddenLabel: string): string {
  return hidden ? hiddenLabel : value;
}

export function Masked({ hidden, children }: { hidden: boolean; children?: ReactNode }) {
  const t = useTranslations('privacyMode');
  if (!hidden) return <>{children}</>;
  return <span data-masked="">{t('hidden')}</span>;
}

/** Texto curto no lugar de um gráfico ou lista de valores do corpo. */
export function HiddenValuesNotice({ title }: { title?: string }) {
  const t = useTranslations('privacyMode');
  return (
    <section className="flex flex-col gap-1 rounded-lg border border-dashed border-border-strong bg-surface p-4 text-sm">
      {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
      <p className="font-semibold">{t('valuesHidden')}</p>
      <p className="text-fg-muted">{t('valuesHiddenHint')}</p>
    </section>
  );
}

/** No lugar do formulário de edição de um registro com valores ocultos. */
export function HiddenEditNotice() {
  const t = useTranslations('privacyMode');
  return <p className="text-sm text-fg-muted">{t('editHidden')}</p>;
}
