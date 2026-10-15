'use client';

import { ChevronLeft, ChevronRight, Expand, LogOut, Shrink } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { exitPresentationAction } from '@/app/presentation-actions';
import { PrivacyModeToggle } from '@/components/privacy-mode/PrivacyModeToggle';
import { buttonClasses } from '@/components/ui/Button';
import { MAIN_CONTENT_ID } from '@/components/ui/SkipLink';
import { cn } from '@/lib/cn';
import {
  PRESENTATION_SCREENS,
  presentationHref,
  type PresentationBase,
  type PresentationScreen,
} from './screens';

function onFullscreenChange(callback: () => void) {
  document.addEventListener('fullscreenchange', callback);
  return () => document.removeEventListener('fullscreenchange', callback);
}
const noSubscription = () => () => {};

/** As setas não trocam de tela dentro de campos e controles que já as usam (ex.: datas do twin). */
function ownsArrows(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('input, textarea, select, [role="slider"], [role="menu"]'));
}

/**
 * Moldura do modo apresentação (§45, ADR-0035): tela cheia pela Fullscreen API (ou a janela inteira, sem
 * ela), quatro telas com setas e botões, Esc sai, foco no título de cada tela e nenhuma animação de troca
 * (nada a desligar com `prefers-reduced-motion`; o twin já respeita a preferência). O conteúdo de cada
 * tela vem pronto do servidor.
 */
export function PresentationDeck({
  scope,
  screen,
  own,
  demo,
  dataSwitch,
  children,
}: {
  scope: 'app' | 'demo';
  screen: PresentationScreen;
  own: boolean;
  demo: boolean;
  /** Escolha entre demonstração e "meus dados" (só na conta). */
  dataSwitch?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('presentation');
  const router = useRouter();
  const base: PresentationBase = scope === 'app' ? '/apresentacao' : '/demo/apresentacao';
  const index = PRESENTATION_SCREENS.indexOf(screen);
  const total = PRESENTATION_SCREENS.length;
  const prev = PRESENTATION_SCREENS[index - 1];
  const next = PRESENTATION_SCREENS[index + 1];
  const href = useCallback(
    (s: PresentationScreen) => presentationHref(base, s, own) as Route,
    [base, own],
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const exitRef = useRef<HTMLFormElement>(null);
  const fullscreen = useSyncExternalStore(
    onFullscreenChange,
    () => Boolean(document.fullscreenElement),
    () => false,
  );
  // No servidor e sem a API: sem o botão (a apresentação ocupa a janela).
  const canFullscreen = useSyncExternalStore(
    noSubscription,
    () => Boolean(document.fullscreenEnabled),
    () => false,
  );

  // Foco no título a cada troca de tela ou de dados: o leitor de tela anuncia o conteúdo novo.
  useEffect(() => {
    titleRef.current?.focus();
  }, [screen, own]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') {
        // Em tela cheia, o navegador usa o Esc para sair dela; fora, o Esc sai da apresentação. Um menu
        // aberto (ex.: ajuda) fecha primeiro.
        if (!document.fullscreenElement && !ownsArrows(event.target))
          exitRef.current?.requestSubmit();
        return;
      }
      if (ownsArrows(event.target)) return;
      const go = (s: PresentationScreen | undefined) => {
        if (!s) return;
        event.preventDefault();
        router.push(href(s));
      };
      if (event.key === 'ArrowRight' || event.key === 'PageDown') go(next);
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') go(prev);
      else if (event.key === 'Home') go(PRESENTATION_SCREENS[0]);
      else if (event.key === 'End') go(PRESENTATION_SCREENS[total - 1]);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [href, next, prev, router, total]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Recusado pelo navegador: a apresentação continua ocupando a janela.
    }
  }

  const screenName = t(`screens.${screen}`);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div className="flex min-h-16 flex-wrap items-center gap-2 px-4 py-2 lg:px-6">
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{t('title')}</h1>
          {demo ? (
            <span
              title={t('demoBadgeDescription')}
              className="rounded-full border border-border-strong bg-surface-muted px-2 py-0.5 text-xs font-bold tracking-wide"
            >
              {t('demoBadge')}
              <span className="sr-only">: {t('demoBadgeDescription')}</span>
            </span>
          ) : null}
          <PrivacyModeToggle />
          {canFullscreen ? (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-pressed={fullscreen}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2 text-sm font-semibold hover:bg-surface-muted"
            >
              {fullscreen ? (
                <Shrink className="size-5" aria-hidden="true" />
              ) : (
                <Expand className="size-5" aria-hidden="true" />
              )}
              <span className="sr-only lg:not-sr-only">{t('fullscreen')}</span>
            </button>
          ) : null}
          <form ref={exitRef} action={exitPresentationAction}>
            <input type="hidden" name="scope" value={scope} />
            <button type="submit" className={buttonClasses('secondary')}>
              <LogOut className="size-4" aria-hidden="true" />
              {t('exit')}
            </button>
          </form>
        </div>
        {dataSwitch ? (
          <div className="border-t border-border px-4 py-2 lg:px-6">{dataSwitch}</div>
        ) : null}
      </header>

      <main id={MAIN_CONTENT_ID} className="flex-1 px-4 py-6 lg:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <p className="text-sm text-fg-muted">
            {t('position', { current: index + 1, total, name: screenName })}
          </p>
          <h2
            ref={titleRef}
            tabIndex={-1}
            className="text-xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {screenName}
          </h2>
          {children}
        </div>
      </main>

      <nav
        aria-label={t('navLabel')}
        className="sticky bottom-0 z-20 border-t border-border bg-surface/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-surface/85 lg:px-6"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2">
          {prev ? (
            <Link href={href(prev)} className={buttonClasses('secondary')}>
              <ChevronLeft className="size-4" aria-hidden="true" />
              {t('previous')}
              <span className="sr-only">: {t(`screens.${prev}`)}</span>
            </Link>
          ) : (
            <span aria-hidden="true" className="min-w-11" />
          )}
          <ol className="flex flex-wrap items-center gap-1">
            {PRESENTATION_SCREENS.map((s, i) => (
              <li key={s}>
                <Link
                  href={href(s)}
                  aria-current={s === screen ? 'step' : undefined}
                  className={cn(
                    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-sm font-semibold',
                    s === screen
                      ? 'border border-primary bg-primary-soft text-primary-soft-fg'
                      : 'hover:bg-surface-muted',
                  )}
                >
                  <span aria-hidden="true">{i + 1}</span>
                  <span className="sr-only">{t(`screens.${s}`)}</span>
                </Link>
              </li>
            ))}
          </ol>
          {next ? (
            <Link href={href(next)} className={buttonClasses('primary')}>
              {t('next')}
              <span className="sr-only">: {t(`screens.${next}`)}</span>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span aria-hidden="true" className="min-w-11" />
          )}
        </div>
        <p className="mx-auto mt-1 hidden w-full max-w-6xl text-xs text-fg-muted md:block">
          {t('keyboardHint')}
        </p>
      </nav>
    </div>
  );
}
