'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Logo } from '@/components/brand/Logo';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/cn';
import { NavLink } from './NavLink';
import {
  ACCOUNT_KEYS,
  ALL_NAV_ITEMS,
  DEMO_ITEMS,
  SIDEBAR_ITEMS,
  type NavItem,
  type ShellVariant,
} from './nav-config';

const NAV_ID = 'sidebar-navegacao';

/**
 * Sidebar (§7, §9). Desktop (>= 1024px): fixa e expandida. Tablet (768–1023px): recolhível,
 * começa recolhida (só ícones, rótulos continuam acessíveis). Mobile: oculta (usa BottomNav).
 * `demo`: só os módulos do demo público (LEG-X02).
 */
export function Sidebar({ variant = 'app' }: { variant?: ShellVariant }) {
  const items =
    variant === 'demo' ? DEMO_ITEMS : SIDEBAR_ITEMS.filter((i) => !ACCOUNT_KEYS.includes(i.key));
  const accountItems =
    variant === 'demo' ? [] : ALL_NAV_ITEMS.filter((i) => ACCOUNT_KEYS.includes(i.key));
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
        {/* Ícone decorativo ("C" + ponto, sem a figura): a barra fica ao lado do twin, das medidas e das metas
            (ADR-0045, LEG-M06). O nome do produto está escrito ao lado. */}
        <Logo largura={40} className="size-10 shrink-0" />
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

      {/* `min-h-0`: em tela baixa o próprio menu rola, sem empurrar a página (9b). */}
      <nav
        id={NAV_ID}
        aria-label={t('nav.mainLabel')}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2"
      >
        <NavGroup items={items} labelClassName={labelClassName} variant={variant} />
        {accountItems.length > 0 ? (
          <div className="mt-auto pt-3">
            <hr className="mb-3 border-border" />
            <p
              className={cn(
                'px-3 pb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase',
                labelClassName,
              )}
            >
              {t('nav.accountGroup')}
            </p>
            <NavGroup items={accountItems} labelClassName={labelClassName} variant={variant} />
          </div>
        ) : null}
      </nav>
    </aside>
  );
}

function NavGroup({
  items,
  labelClassName,
  variant,
}: {
  items: readonly NavItem[];
  labelClassName?: string;
  variant: ShellVariant;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.key}>
          <NavLink navKey={item.key} labelClassName={labelClassName} variant={variant} />
        </li>
      ))}
    </ul>
  );
}
