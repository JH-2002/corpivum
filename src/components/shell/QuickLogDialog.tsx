'use client';

import {
  Activity,
  Apple,
  Droplet,
  ListChecks,
  type LucideIcon,
  Moon,
  Scale,
  Target,
  X,
} from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef } from 'react';
import { useDialogFocusLoop } from '@/components/ui/dialog-focus';
import { IconButton } from '@/components/ui/IconButton';
import { focusProgrammatically } from '@/components/ui/programmatic-focus';
import type { ShellVariant } from './nav-config';
import { useShell } from './ShellProvider';

type QuickLogKey = 'sleep' | 'habit' | 'body' | 'meal' | 'water' | 'activity' | 'goal';

interface QuickLogItem {
  key: QuickLogKey;
  href: Route;
  icon: LucideIcon;
  tone: string;
}

const ITEMS: readonly QuickLogItem[] = [
  { key: 'sleep', href: '/sono#novo', icon: Moon, tone: 'text-sleep' },
  { key: 'habit', href: '/habitos#novo', icon: ListChecks, tone: 'text-primary' },
  { key: 'body', href: '/corpo#novo', icon: Scale, tone: 'text-body' },
  { key: 'meal', href: '/alimentacao#novo', icon: Apple, tone: 'text-nutrition' },
  { key: 'water', href: '/alimentacao', icon: Droplet, tone: 'text-info' },
  { key: 'activity', href: '/atividade#novo', icon: Activity, tone: 'text-activity' },
  { key: 'goal', href: '/metas#novo', icon: Target, tone: 'text-primary' },
];

/**
 * Demo público (9b): os mesmos tipos, levando aos formulários de exemplo do demo (`ExampleForm`), onde nada é
 * enviado. A água fica de fora: no demo não há registro de exemplo para ela.
 */
const DEMO_ITEMS: readonly QuickLogItem[] = [
  { key: 'sleep', href: '/demo/sono#novo', icon: Moon, tone: 'text-sleep' },
  { key: 'habit', href: '/demo/habitos#novo', icon: ListChecks, tone: 'text-primary' },
  { key: 'body', href: '/demo/corpo#novo', icon: Scale, tone: 'text-body' },
  { key: 'meal', href: '/demo/alimentacao#novo', icon: Apple, tone: 'text-nutrition' },
  { key: 'activity', href: '/demo/atividade#novo', icon: Activity, tone: 'text-activity' },
  { key: 'goal', href: '/demo/metas#novo', icon: Target, tone: 'text-primary' },
];

/** Primeiro campo ativo; no formulário de exemplo do demo (campos desativados), o próprio exemplo. */
const FIELD =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
  '[data-example-focus]';
/** Até ~2 s de quadros esperando a tela nova aparecer (navegação pelo cliente com streaming). */
const MAX_FRAMES = 120;

/**
 * Depois de escolher o tipo, o foco vai ao primeiro campo do formulário (`#novo`) ou ao conteúdo principal,
 * e não volta ao botão "Registrar" do topo (7d, WCAG 2.4.3): sem isso, quem usa teclado ou leitor de tela
 * recomeçava do cabeçalho e precisava atravessar a página inteira até o formulário.
 */
function focusTarget(hash: string | null): () => void {
  let frame = 0;
  let tries = 0;
  const attempt = () => {
    // O <dialog> devolve o foco a quem o abriu ao fechar: só move depois disso.
    const closed = !document.querySelector('dialog[open]');
    const scope = hash ? document.getElementById(hash) : null;
    const field = scope?.querySelector<HTMLElement>(FIELD);
    const target = field ?? (hash && !scope ? null : document.querySelector<HTMLElement>('main'));
    if (closed && target) {
      focusProgrammatically(target);
      return;
    }
    tries += 1;
    if (tries < MAX_FRAMES) frame = requestAnimationFrame(attempt);
  };
  frame = requestAnimationFrame(attempt);
  return () => cancelAnimationFrame(frame);
}

/**
 * Seletor rápido do tipo de registro (§7). <dialog> nativo em modo modal: foco preso, fundo inerte,
 * Esc fecha e o foco volta ao elemento que abriu. Escolher um tipo leva direto ao formulário do módulo
 * (≤ 3 cliques, §3), com o foco no primeiro campo.
 */
export function QuickLogDialog({ variant = 'app' }: { variant?: ShellVariant }) {
  const t = useTranslations('quickLog');
  const tc = useTranslations('common');
  const { quickLogOpen, closeQuickLog } = useShell();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const pathname = usePathname();
  /** Destino escolhido; o foco é movido quando a rota nova estiver na tela. */
  const pending = useRef<{ path: string; hash: string | null } | null>(null);

  useEffect(() => {
    const target = pending.current;
    if (!target || target.path !== pathname) return;
    pending.current = null;
    return focusTarget(target.hash);
  }, [pathname]);

  const choose = useCallback(
    (href: string) => {
      const [path = '', hash] = href.split('#');
      closeQuickLog();
      if (path === pathname) {
        // Mesma rota: a navegação não muda o `pathname`; move o foco depois de o diálogo devolver o dele.
        focusTarget(hash ?? null);
      } else {
        pending.current = { path, hash: hash ?? null };
      }
    },
    [closeQuickLog, pathname],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (quickLogOpen && !dialog.open) dialog.showModal();
    if (!quickLogOpen && dialog.open) dialog.close();
  }, [quickLogOpen]);

  useDialogFocusLoop(dialogRef);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={closeQuickLog}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-fg shadow-lg backdrop:bg-black/50"
    >
      <div className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div>
          <h2 id={titleId} className="text-lg font-semibold">
            {t('title')}
          </h2>
          <p id={descriptionId} className="text-sm text-fg-muted">
            {t(variant === 'demo' ? 'demoDescription' : 'description')}
          </p>
        </div>
        <IconButton label={tc('close')} onClick={closeQuickLog}>
          <X className="size-5" aria-hidden="true" />
        </IconButton>
      </div>
      <ul className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
        {(variant === 'demo' ? DEMO_ITEMS : ITEMS).map(({ key, href, icon: Icon, tone }) => (
          <li key={key}>
            <Link
              href={href}
              onClick={() => choose(href)}
              className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-md border border-border p-3 text-center text-sm font-medium hover:bg-surface-muted"
            >
              <Icon className={`size-6 ${tone}`} aria-hidden="true" />
              {t(key)}
            </Link>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
