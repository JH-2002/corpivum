'use client';

import { Bell, CircleUser, LogOut, Plus, Settings, ShieldCheck, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { logoutAction } from '@/app/(auth)/actions';
import { DemoOnlyBanner } from '@/components/demo/DemoOnlyBanner';
import { useDemoOnly } from '@/components/demo/DemoOnlyContext';
import {
  PrivacyModeIndicator,
  PrivacyModeToggle,
} from '@/components/privacy-mode/PrivacyModeToggle';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Magnetic } from '@/components/ui/Magnetic';
import { Disclosure } from './Disclosure';
import { HelpMenu } from './HelpMenu';
import { DEMO_ITEMS, navItemForPath, type ShellVariant } from './nav-config';
import { PeriodSelector } from './PeriodSelector';
import { useShell } from './ShellProvider';
import { useRouteFocus } from './useRouteFocus';

const menuItemClass =
  'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-surface-muted';

/**
 * Header (§8 + adendo): título da página, seletor de período, registro rápido, notificações,
 * atalho para a Central de Privacidade, menu da conta, modo privacidade (ADR-0035) e indicador DEMO quando
 * em demonstração.
 * `variant="demo"` (demo público, LEG-X02): registro rápido em modo exemplo (9b), sem notificações nem conta;
 * CTA para criar conta e link para a Política. No modo só demo (ADR-0043), sem o CTA e com a faixa fixa de que o app
 * ainda não está aberto ao público, que leva o link "Sobre esta demonstração".
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
  const demoOnly = useDemoOnly();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useRouteFocus(titleRef);
  const current = navItemForPath(pathname, variant === 'demo' ? DEMO_ITEMS : undefined);
  const title =
    pathname === '/mais' || pathname === '/demo/mais'
      ? t('pages.more.title')
      : pathname === '/demo/sobre'
        ? t('header.aboutDemo')
        : current
          ? t(`nav.${current.key}`)
          : t('common.appName');

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      {variant === 'demo' ? <DemoOnlyBanner aboutLink /> : null}
      <div className="flex min-h-16 items-center gap-2 px-4 lg:px-6">
        <h1
          ref={titleRef}
          id="page-title"
          tabIndex={-1}
          className="min-w-0 flex-1 truncate text-lg font-semibold md:text-xl"
        >
          {title}
        </h1>

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
            {/* Modo só demo (ADR-0043): sem Política do app nem cadastro; "Sobre esta demonstração" fica na faixa
                do topo (9d0). */}
            {demoOnly ? null : (
              <Link
                href="/legal/politica-de-privacidade"
                aria-label={t('header.privacyPolicy')}
                title={t('header.privacyPolicy')}
                className="inline-flex size-11 items-center justify-center rounded-md text-fg hover:bg-surface-muted"
              >
                <ShieldCheck className="size-5" aria-hidden="true" />
              </Link>
            )}
            <HelpMenu tourHref="/demo?tour=1" />
            {/* Registrar também no demo (9b): abre os formulários de exemplo, onde nada é enviado. */}
            <QuickLogButton onQuickLog={openQuickLog} />
            {demoOnly ? null : (
              <Link href="/cadastro" className={buttonClasses('secondary', 'shrink-0')}>
                {t('demo.createAccount')}
              </Link>
            )}
          </>
        ) : (
          <AppActions onQuickLog={openQuickLog} />
        )}
      </div>

      {/* Segunda linha: período e modo privacidade (na primeira não cabe a 320px, §42). */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 lg:px-6">
        <div data-tour="period" className="min-w-0 flex-1">
          <PeriodSelector />
        </div>
        <PrivacyModeToggle />
      </div>
      <PrivacyModeIndicator />
    </header>
  );
}

const iconLinkClass =
  'inline-flex size-11 items-center justify-center rounded-md text-fg hover:bg-surface-muted';

/** Registro rápido no topo (tablet e desktop); no mobile ele fica no centro da navegação inferior. */
function QuickLogButton({ onQuickLog }: { onQuickLog: () => void }) {
  const t = useTranslations('quickLog');
  return (
    <div className="hidden md:block" data-tour="register">
      {/* Ímã leve só aqui, no desktop com mouse (9f, ADR-0055). */}
      <Magnetic>
        <Button onClick={onQuickLog} aria-haspopup="dialog" className="shrink-0">
          <Plus className="size-4" aria-hidden="true" />
          {t('open')}
        </Button>
      </Magnetic>
    </div>
  );
}

/** Ações da área logada: registro rápido, privacidade, notificações e conta. */
function AppActions({ onQuickLog }: { onQuickLog: () => void }) {
  const t = useTranslations();
  return (
    <>
      <QuickLogButton onQuickLog={onQuickLog} />

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
