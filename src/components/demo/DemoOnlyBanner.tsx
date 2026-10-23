'use client';

import { Info } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useDemoOnly } from './DemoOnlyContext';

/**
 * Faixa fixa do modo só demo (ADR-0043, fase 8b; ADR-0044): fica dentro dos cabeçalhos fixos da demonstração
 * e do modo apresentação, então não sai da tela ao rolar. Fora do modo só demo não aparece: no app completo
 * aberto ao público, "ainda não está aberto" seria falso. Com `aboutLink` (telas da demonstração, 9d0), leva o
 * link "Sobre esta demonstração", que antes se repetia no cartão do início e no cabeçalho.
 */
export function DemoOnlyBanner({ aboutLink = false }: { aboutLink?: boolean }) {
  const t = useTranslations('demo');
  const demoOnly = useDemoOnly();
  const pathname = usePathname();
  if (!demoOnly) return null;
  const onAbout = pathname === '/demo/sobre';
  return (
    <div
      role="note"
      data-testid="demo-only-banner"
      className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-border bg-info-soft px-4 py-2 text-sm font-semibold lg:px-6"
    >
      <p className="flex items-start gap-2">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t('notPublicBanner')}
      </p>
      {aboutLink ? (
        <Link
          href="/demo/sobre"
          aria-current={onAbout ? 'page' : undefined}
          className="text-primary underline underline-offset-4"
        >
          {t('aboutLink')}
        </Link>
      ) : null}
    </div>
  );
}
