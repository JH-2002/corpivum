'use client';

import {
  Activity,
  Apple,
  Droplet,
  ListChecks,
  type LucideIcon,
  Moon,
  NotebookPen,
  Pill,
  Scale,
  Smile,
  X,
} from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { useShell } from './ShellProvider';

type QuickLogKey =
  'sleep' | 'mood' | 'habit' | 'journal' | 'body' | 'meal' | 'water' | 'activity' | 'medication';

const ITEMS: ReadonlyArray<{ key: QuickLogKey; href: Route; icon: LucideIcon; tone: string }> = [
  { key: 'sleep', href: '/sono#novo', icon: Moon, tone: 'text-sleep' },
  { key: 'mood', href: '/humor#novo', icon: Smile, tone: 'text-mood' },
  { key: 'habit', href: '/habitos#novo', icon: ListChecks, tone: 'text-primary' },
  { key: 'journal', href: '/diario#novo', icon: NotebookPen, tone: 'text-journal' },
  { key: 'body', href: '/corpo#novo', icon: Scale, tone: 'text-body' },
  { key: 'meal', href: '/alimentacao', icon: Apple, tone: 'text-nutrition' },
  { key: 'water', href: '/alimentacao', icon: Droplet, tone: 'text-info' },
  { key: 'activity', href: '/atividade', icon: Activity, tone: 'text-activity' },
  { key: 'medication', href: '/medicamentos', icon: Pill, tone: 'text-medications' },
];

/**
 * Seletor rápido do tipo de registro (§7). <dialog> nativo em modo modal: foco preso, fundo inerte,
 * Esc fecha e o foco volta ao elemento que abriu. Sono, humor, hábitos, diário e corpo levam direto ao
 * formulário do módulo (≤ 3 cliques, §3); os demais chegam nas fases seguintes.
 */
export function QuickLogDialog() {
  const t = useTranslations('quickLog');
  const tc = useTranslations('common');
  const { quickLogOpen, closeQuickLog } = useShell();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (quickLogOpen && !dialog.open) dialog.showModal();
    if (!quickLogOpen && dialog.open) dialog.close();
  }, [quickLogOpen]);

  // O modal nativo deixa o Tab escapar para a interface do navegador; mantemos o ciclo dentro do diálogo.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusables = dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, []);

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
            {t('description')}
          </p>
        </div>
        <IconButton label={tc('close')} onClick={closeQuickLog}>
          <X className="size-5" aria-hidden="true" />
        </IconButton>
      </div>
      <ul className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
        {ITEMS.map(({ key, href, icon: Icon, tone }) => (
          <li key={key}>
            <Link
              href={href}
              onClick={closeQuickLog}
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
