'use client';

import { Bell, CircleUser, LogOut, Plus, Settings, ShieldCheck, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { logoutAction } from '@/app/(auth)/actions';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Disclosure } from './Disclosure';
import { HelpMenu } from './HelpMenu';
import { DEMO_ITEMS, navItemForPath, type ShellVariant } from './nav-config';
import { PeriodSelector } from './PeriodSelector';
import { useShell } from './ShellProvider';

const menuItemClass =
  'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-surface-muted';

/**
 * Header (§8 + adendo): título da página, seletor de período, registro rápido, notificações,
 * atalho para a Central de Privacidade, menu da conta e indicador DEMO quando em demonstração.
 * `variant="demo"` (demo público, LEG-X02): sem registro rápido, notificações nem conta; CTA para criar
 * conta e link para a Política.
 */
export function Header({
  isDemo = false,
  variant = 'app',
}: {
  isDemo?: boolean;
  variant?: ShellVariant;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const { openQuickLog } = useShell();
  const current = navItemForPath(pathname, variant === 'demo' ? DEMO_ITEMS : undefined);
  const title =
    pathname === '/mais'
      ? t('pages.more.title')
      : current
        ? t(`nav.${current.key}`)
        : t('common.appName');

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="flex min-h-16 items-center gap-2 px-4 lg:px-6">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold md:text-xl">{title}</h1>

        {isDemo ? (
          <span
            title={t('common.demoBadgeDescription')}
            className="rounded-full border border-border-strong bg-surface-muted px-2 py-0.5 text-xs font-bold tracking-wide"
          >
            {t('common.demoBadge')}
            <span className="sr-only">: {t('common.demoBadgeDescription')}</span>
          </span>
        ) : null}

        {variant === 'demo' ? (
          <>
            <Link
              href="/legal/politica-de-privacidade"
              aria-label={t('header.privacyPolicy')}
              title={t('header.privacyPolicy')}
              className="inline-flex size-11 items-center justify-center rounded-md text-fg hover:bg-surface-muted"
            >
              <ShieldCheck className="size-5" aria-hidden="true" />
            </Link>
            <HelpMenu tourHref="/demo?tour=1" />
            <Link href="/cadastro" className={buttonClasses('primary', 'shrink-0')}>
              {t('demo.createAccount')}
            </Link>
          </>
        ) : (
          <AppActions onQuickLog={openQuickLog} />
        )}
      </div>

      <div data-tour="period" className="border-t border-border px-4 py-2 lg:px-6">
        <PeriodSelector />
      </div>
    </header>
  );
}

const iconLinkClass =
  'inline-flex size-11 items-center justify-center rounded-md text-fg hover:bg-surface-muted';

/** Ações da área logada: registro rápido, privacidade, notificações e conta. */
function AppActions({ onQuickLog }: { onQuickLog: () => void }) {
  const t = useTranslations();
  return (
    <>
      {/* No mobile o registro rápido fica na navegação inferior. */}
      <div className="hidden md:block">
        <Button onClick={onQuickLog} aria-haspopup="dialog">
          <Plus className="size-4" aria-hidden="true" />
          {t('quickLog.open')}
        </Button>
      </div>

      <Link
        href="/privacidade"
        aria-label={t('header.privacy')}
        title={t('header.privacy')}
        className={iconLinkClass}
      >
        <ShieldCheck className="size-5" aria-hidden="true" />
      </Link>

      <HelpMenu tourHref="/inicio?tour=1" />

      <Disclosure
        label={t('header.notifications')}
        trigger={<Bell className="size-5" aria-hidden="true" />}
      >
        <p className="p-3 text-sm text-fg-muted">{t('header.notificationsEmpty')}</p>
      </Disclosure>

      <Disclosure
        label={t('header.accountMenu')}
        trigger={<CircleUser className="size-5" aria-hidden="true" />}
      >
        <ul className="flex flex-col">
          <li>
            <Link href="/configuracoes" className={menuItemClass}>
              <User className="size-4" aria-hidden="true" />
              {t('header.profile')}
            </Link>
          </li>
          <li>
            <Link href="/configuracoes" className={menuItemClass}>
              <Settings className="size-4" aria-hidden="true" />
              {t('header.settings')}
            </Link>
          </li>
          <li>
            <Link href="/privacidade" className={menuItemClass}>
              <ShieldCheck className="size-4" aria-hidden="true" />
              {t('header.privacy')}
            </Link>
          </li>
          <li>
            <form action={logoutAction}>
              <button type="submit" className={menuItemClass}>
                <LogOut className="size-4" aria-hidden="true" />
                {t('header.signOut')}
              </button>
            </form>
          </li>
        </ul>
      </Disclosure>
    </>
  );
}
