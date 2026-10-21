'use client';

import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDemoOnly } from './DemoOnlyContext';

/**
 * Faixa fixa do modo só demo (ADR-0043, fase 8b; ADR-0044): fica dentro dos cabeçalhos fixos da demonstração
 * e do modo apresentação, então não sai da tela ao rolar. Fora do modo só demo não aparece: no app completo
 * aberto ao público, "ainda não está aberto" seria falso.
 */
export function DemoOnlyBanner() {
  const t = useTranslations('demo');
  const demoOnly = useDemoOnly();
  if (!demoOnly) return null;
  return (
    <p
      role="note"
      data-testid="demo-only-banner"
      className="flex items-start gap-2 border-b border-border bg-info-soft px-4 py-2 text-sm font-semibold lg:px-6"
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {t('notPublicBanner')}
    </p>
  );
}
