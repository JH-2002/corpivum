'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import { markTourSeenAction } from '@/app/(app)/inicio/actions';
import { usePrefersReducedMotion } from '@/components/charts/reduced-motion';
import { Button, buttonClasses } from '@/components/ui/Button';
import { useDialogFocusLoop } from '@/components/ui/dialog-focus';

/**
 * Passos do tour do painel (ADR-0025). Cada passo aponta para um elemento marcado com
 * `data-tour="<alvo>"`; o passo some quando o alvo não está na tela (ex.: estado vazio sem gráfico).
 */
export const TOUR_STEPS = [
  { id: 'welcome', target: null },
  { id: 'summary', target: 'summary' },
  { id: 'score', target: 'score' },
  { id: 'cards', target: 'cards' },
  { id: 'chart', target: 'chart' },
  { id: 'period', target: 'period' },
  { id: 'help', target: 'help' },
] as const;
type Step = (typeof TOUR_STEPS)[number];

/** Chave do demo público (sem conta): só no navegador, nada vai ao servidor (LEG-X02). */
export const DEMO_TOUR_STORAGE_KEY = 'hm_tour_demo_seen';

const ACTIVE_ATTR = 'data-tour-active';

function targetOf(step: Step): HTMLElement | null {
  return step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
}

function readLocalSeen(): boolean {
  try {
    return window.localStorage.getItem(DEMO_TOUR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeLocalSeen(): void {
  try {
    window.localStorage.setItem(DEMO_TOUR_STORAGE_KEY, '1');
  } catch {
    // Armazenamento bloqueado (janela privada, dados do site limpos): o tour pode reaparecer.
  }
}

/**
 * Tour opcional do painel (ADR-0025): abre sozinho na primeira visita, pode ser pulado a qualquer
 * momento (botão ou Esc) e reaberto pelo menu de ajuda (`?tour=1`). Diálogo modal nativo com foco preso
 * e devolvido ao fim; o alvo de cada passo ganha contorno visível e rola até a tela, sem animação com
 * `prefers-reduced-motion`. Fica encaixado embaixo da tela para não cobrir o que está explicando.
 */
export function Tour({
  autoStart,
  persist,
}: {
  /** Abrir sozinho: na conta, quando o tour ainda não foi visto; no demo público, se o navegador não lembra. */
  autoStart: boolean;
  /** Onde lembrar que foi visto: na conta (servidor) ou só no navegador (demo público). */
  persist: 'server' | 'local';
}) {
  const t = useTranslations('tour');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get('tour') === '1';
  const reduced = usePrefersReducedMotion();
  const [, startTransition] = useTransition();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useDialogFocusLoop(dialogRef);

  const start = useCallback(() => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSteps(TOUR_STEPS.filter((s) => s.target === null || targetOf(s) !== null));
    setIndex(0);
  }, []);

  // Abre na primeira visita ou quando o menu de ajuda pede (`?tour=1`).
  useEffect(() => {
    const auto = autoStart && (persist === 'server' || !readLocalSeen());
    if (!requested && !auto) return;
    // Espera o quadro seguinte: os alvos (`data-tour`) precisam estar na tela para montar os passos.
    const frame = window.requestAnimationFrame(start);
    return () => window.cancelAnimationFrame(frame);
  }, [requested, autoStart, persist, start]);

  const step = steps?.[index];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (step && !dialog.open) dialog.showModal();
    if (!step && dialog.open) dialog.close();
    if (!step) return;
    // O foco fica no botão principal a cada passo; o texto novo é anunciado pela região `aria-live`.
    primaryRef.current?.focus();
    const target = targetOf(step);
    target?.setAttribute(ACTIVE_ATTR, '');
    target?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    return () => target?.removeAttribute(ACTIVE_ATTR);
  }, [step, reduced]);

  const finish = useCallback(() => {
    setSteps(null);
    if (persist === 'server') {
      startTransition(() => {
        // Falha ao gravar só faz o tour reabrir na próxima visita; o erro não carrega dado de saúde.
        markTourSeenAction().catch(() => {});
      });
    } else {
      writeLocalSeen();
    }
    if (requested)
      router.replace(pathname as Parameters<typeof router.replace>[0], { scroll: false });
    const back = returnFocus.current;
    const help = document.querySelector<HTMLElement>('[data-tour="help"] button');
    (back?.isConnected && back !== document.body ? back : help)?.focus();
  }, [persist, requested, router, pathname]);

  const last = steps !== null && index === steps.length - 1;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault();
        finish();
      }}
      className="mx-auto mt-auto mb-4 w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border-strong bg-surface p-4 text-fg shadow-lg backdrop:bg-black/20"
    >
      {step && steps ? (
        <div className="flex flex-col gap-3">
          <div aria-live="polite" className="flex flex-col gap-1">
            <p className="text-sm text-fg-muted">
              {t('progress', { current: index + 1, total: steps.length })}
            </p>
            <h2 id={titleId} className="text-lg font-semibold">
              {t(`steps.${step.id}.title`)}
            </h2>
            <p id={bodyId}>{t(`steps.${step.id}.body`)}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={finish}>
              {t('skip')}
            </Button>
            <div className="flex gap-2">
              {index > 0 ? (
                <Button variant="secondary" onClick={() => setIndex((i) => i - 1)}>
                  {t('previous')}
                </Button>
              ) : null}
              <button
                ref={primaryRef}
                type="button"
                className={buttonClasses('primary')}
                onClick={() => (last ? finish() : setIndex((i) => i + 1))}
              >
                {last ? t('done') : t('next')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
