'use client';

import { CircleHelp, Compass } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import { SupportNotice } from '@/components/health/SupportNotice';
import { CONFIDENCE_LEVELS } from '@/components/ui/ConfidenceBadge';
import { Disclosure } from './Disclosure';

/**
 * Menu de ajuda (ADR-0025): reabre o tour do painel em qualquer tela, explica os selos de origem do
 * dado (§39) e dá acesso permanente ao apoio, "Precisa de ajuda?" (§48, ADR-0027). Mesmo padrão
 * "disclosure" do menu da conta (ADR-0011).
 */
export function HelpMenu({ tourHref }: { tourHref: '/inicio?tour=1' | '/demo?tour=1' }) {
  const t = useTranslations('help');
  const tb = useTranslations('badges');
  return (
    <Disclosure
      label={t('menu')}
      tourId="help"
      panelClassName="w-80 max-h-[70vh] overflow-y-auto"
      trigger={<CircleHelp className="size-5" aria-hidden="true" />}
    >
      <Link
        href={tourHref as Route}
        className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold hover:bg-surface-muted"
      >
        <Compass className="size-4" aria-hidden="true" />
        {t('tour')}
      </Link>
      <section
        aria-labelledby="help-badges"
        className="mt-2 border-t border-border px-3 pt-2 text-sm"
      >
        <h2 id="help-badges" className="font-semibold">
          {t('badgesTitle')}
        </h2>
        <p className="text-fg-muted">{t('badgesIntro')}</p>
        <dl className="mt-2 flex flex-col gap-1">
          {CONFIDENCE_LEVELS.map((level) => (
            <div key={level}>
              <dt className="font-semibold">{tb(level)}</dt>
              <dd className="text-fg-muted">{tb(`${level}_hint`)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section
        aria-labelledby="help-support"
        className="mt-2 flex flex-col gap-2 border-t border-border px-3 pt-2 text-sm"
        data-testid="help-support"
      >
        <h2 id="help-support" className="font-semibold">
          {t('supportTitle')}
        </h2>
        <p className="text-fg-muted">{t('supportIntro')}</p>
        <SupportNotice />
      </section>
    </Disclosure>
  );
}
