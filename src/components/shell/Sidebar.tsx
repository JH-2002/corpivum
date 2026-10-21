'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { PRODUCT_MONOGRAM } from '@/config/product';
import { cn } from '@/lib/cn';
import { NavLink } from './NavLink';
import { DEMO_ITEMS, PRIVACY_ITEM, SIDEBAR_ITEMS, type ShellVariant } from './nav-config';

const NAV_ID = 'sidebar-navegacao';

/**
 * Sidebar (§7, §9). Desktop (>= 1024px): fixa e expandida. Tablet (768–1023px): recolhível,
 * começa recolhida (só ícones, rótulos continuam acessíveis). Mobile: oculta (usa BottomNav).
 * `demo`: só os módulos do demo público (LEG-X02).
 */
export function Sidebar({ variant = 'app' }: { variant?: ShellVariant }) {
  const items = variant === 'demo' ? DEMO_ITEMS : SIDEBAR_ITEMS;
  const t = useTranslations();
  const [expanded, setExpanded] = useState(false);
  const labelClassName = expanded ? undefined : 'md:max-lg:sr-only';

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface md:flex',
        expanded ? 'md:w-64' : 'md:w-18 lg:w-64',
      )}
    >
      <div className="flex h-16 items-center gap-2 px-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-fg"
        >
          {PRODUCT_MONOGRAM}
        </span>
        <span className={cn('truncate font-semibold', labelClassName)}>{t('common.appName')}</span>
      </div>

      <div className="px-3 lg:hidden">
        <IconButton
          label={expanded ? t('nav.collapse') : t('nav.expand')}
          aria-expanded={expanded}
          aria-controls={NAV_ID}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <PanelLeftClose className="size-5" aria-hidden="true" />
          ) : (
            <PanelLeftOpen className="size-5" aria-hidden="true" />
          )}
        </IconButton>
      </div>

      <nav id={NAV_ID} aria-label={t('nav.mainLabel')} className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.key}>
              <NavLink navKey={item.key} labelClassName={labelClassName} variant={variant} />
            </li>
          ))}
        </ul>
        {variant === 'app' ? (
          <>
            <hr className="my-3 border-border" />
            <NavLink navKey={PRIVACY_ITEM.key} labelClassName={labelClassName} />
          </>
        ) : null}
      </nav>
    </aside>
  );
}
