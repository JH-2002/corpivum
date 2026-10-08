'use client';

import { Ellipsis, History, House, Orbit, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Route } from 'next';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  DEMO_ITEMS,
  isActivePath,
  isItemActive,
  MORE_ITEMS,
  type ShellVariant,
} from './nav-config';
import { useShell } from './ShellProvider';

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
        aria-current={active ? 'page' : undefined}
        className={cn(itemClass, active ? 'font-semibold text-primary' : 'text-fg-muted')}
      >
        <Icon className="size-5" aria-hidden="true" />
        <span className={cn(active && 'underline decoration-2 underline-offset-4')}>{label}</span>
      </Link>
    </li>
  );
}

/** Navegação inferior do demo público: só os módulos com dados de demonstração (LEG-X02). */
function DemoBottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('mobileLabel')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex items-stretch gap-0.5 px-1 py-1">
        {DEMO_ITEMS.map((item) => (
          <BottomLink
            key={item.key}
            href={item.href}
            label={t(
              item.key === 'mood' ? 'moodShort' : item.key === 'twin' ? 'twinShort' : item.key,
            )}
            icon={item.icon}
            active={isItemActive(pathname, item)}
          />
        ))}
      </ul>
    </nav>
  );
}

/** Navegação inferior em telas < 768px (§7): Início, Registrar, Twin, Timeline, Mais. */
export function BottomNav({ variant = 'app' }: { variant?: ShellVariant }) {
  if (variant === 'demo') return <DemoBottomNav />;
  return <AppBottomNav />;
}

function AppBottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const { openQuickLog } = useShell();
  const moreActive =
    pathname === '/mais' || MORE_ITEMS.some((item) => isActivePath(pathname, item.href));

  return (
    <nav
      aria-label={t('mobileLabel')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex items-stretch gap-1 px-1 py-1">
        <BottomLink
          href="/inicio"
          label={t('home')}
          icon={House}
          active={isActivePath(pathname, '/inicio')}
        />
        <li className="flex flex-1">
          <button
            type="button"
            onClick={openQuickLog}
            aria-haspopup="dialog"
            className={cn(itemClass, 'font-semibold text-primary')}
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-fg">
              <Plus className="size-5" aria-hidden="true" />
            </span>
            {t('log')}
          </button>
        </li>
        <BottomLink
          href="/twin"
          label={t('twinShort')}
          icon={Orbit}
          active={isActivePath(pathname, '/twin')}
        />
        <BottomLink
          href="/timeline"
          label={t('timeline')}
          icon={History}
          active={isActivePath(pathname, '/timeline')}
        />
        <BottomLink href="/mais" label={t('more')} icon={Ellipsis} active={moreActive} />
      </ul>
    </nav>
  );
}
