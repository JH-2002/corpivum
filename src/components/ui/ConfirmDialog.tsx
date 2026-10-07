'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { buttonClasses, type ButtonVariant } from './Button';
import { IconButton } from './IconButton';

export interface ConfirmDialogProps {
  /** Texto do botão que abre o diálogo (1º clique). */
  triggerLabel: string;
  /** Nome acessível do botão, quando precisa de mais contexto que o texto visível. */
  triggerAriaLabel?: string;
  triggerVariant?: ButtonVariant;
  title: string;
  /** Conteúdo: explicação e o formulário com a ação de confirmação (2º clique). */
  children: (close: () => void) => ReactNode;
}

/**
 * Confirmação em diálogo modal nativo (mesmo padrão do registro rápido, ADR-0011): foco preso, Esc fecha,
 * o foco volta ao botão que abriu. Usado onde a ação tem consequência importante (revogar dados de
 * bem-estar, encerrar conta), mantendo o total em 2 cliques (LEG-C04).
 */
export function ConfirmDialog({
  triggerLabel,
  triggerAriaLabel,
  triggerVariant = 'secondary',
  title,
  children,
}: ConfirmDialogProps) {
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"])',
      );
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

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        className={buttonClasses(triggerVariant)}
        aria-label={triggerAriaLabel}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={close}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-fg shadow-lg backdrop:bg-black/50"
      >
        <div className="flex items-start justify-between gap-2 border-b border-border p-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <IconButton label={tc('close')} onClick={close}>
            <X className="size-5" aria-hidden="true" />
          </IconButton>
        </div>
        <div className="flex flex-col gap-4 p-4">{open ? children(close) : null}</div>
      </dialog>
    </>
  );
}
