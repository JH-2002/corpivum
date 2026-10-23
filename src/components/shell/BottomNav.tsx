'use client';

import { Ellipsis, History, House, Orbit, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Route } from 'next';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  BOTTOM_NAV_HREFS,
  DEMO_MORE_ITEMS,
  isActivePath,
  MORE_ITEMS,
  type ShellVariant,
} from './nav-config';
import { useShell } from './ShellProvider';
import { PAGE_TRANSITION_TYPE } from './page-transition';

const itemClass =
  'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-xs';

function BottomLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: Route;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <li className="flex flex-1">
      <Link
        href={href}
        transitionTypes={[PAGE_TRANSITION_TYPE]}
        aria-current={active ? 'page' : undefined}
        className={cn(itemClass, active ? 'font-semibold text-primary' : 'text-fg-muted')}
      >
        {/* Ativo: cor + fundo em pílula atrás do ícone + sublinhado (a cor nunca é o único canal, §9). */}
        <span
          className={cn(
            'flex h-7 w-12 items-center justify-center rounded-full',
            active && 'bg-primary-soft',
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className={cn(active && 'underline decoration-2 underline-offset-4')}>{label}</span>
      </Link>
    </li>
  );
}

/**
 * Navegação inferior em telas < 768px (§7): Início · Twin · Registrar · Timeline · Mais, igual no app e no demo
 * público (9b). Cabe em 320px sem rolagem; os demais módulos ficam no "Mais".
 */
export function BottomNav({ variant = 'app' }: { variant?: ShellVariant }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const { openQuickLog } = useShell();
  const hrefs = BOTTOM_NAV_HREFS[variant];
  const moreItems = variant === 'demo' ? DEMO_MORE_ITEMS : MORE_ITEMS;
  const moreActive =
    pathname === hrefs.more || moreItems.some((item) => isActivePath(pathname, item.href));

  return (
    <nav
      aria-label={t('mobileLabel')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex items-stretch gap-1 px-1 py-1">
        <BottomLink
          href={hrefs.home}
          label={t('home')}
          icon={House}
          active={isActivePath(pathname, hrefs.home, variant === 'demo')}
        />
        <BottomLink
          href={hrefs.twin}
          label={t('twinShort')}
          icon={Orbit}
          active={isActivePath(pathname, hrefs.twin)}
        />
        <li className="flex flex-1" data-tour="register">
          <button
            type="button"
            onClick={openQuickLog}
            aria-haspopup="dialog"
            className={cn(itemClass, 'font-semibold text-primary')}
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-fg shadow-md">
              <Plus className="size-5" aria-hidden="true" />
            </span>
            {t('log')}
          </button>
        </li>
        <BottomLink
          href={hrefs.timeline}
          label={t('timeline')}
          icon={History}
          active={isActivePath(pathname, hrefs.timeline)}
        />
        <BottomLink href={hrefs.more} label={t('more')} icon={Ellipsis} active={moreActive} />
      </ul>
    </nav>
  );
}
