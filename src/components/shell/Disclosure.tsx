'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface DisclosureProps {
  /** Conteúdo do botão (ícone). */
  trigger: ReactNode;
  /** Nome acessível do botão. */
  label: string;
  children: ReactNode;
  panelClassName?: string;
  /** Alvo do tour do painel (`data-tour`, ADR-0025). */
  tourId?: string;
}

/**
 * Painel suspenso no padrão "disclosure" (botão + aria-expanded), usado no menu da conta e nas
 * notificações. Fecha com Esc (devolvendo o foco ao botão), clique fora ou foco saindo do painel.
 */
export function Disclosure({ trigger, label, children, panelClassName, tourId }: DisclosureProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const root = rootRef.current;
    const onFocusOut = (event: FocusEvent) => {
      if (!root?.contains(event.relatedTarget as Node | null)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    root?.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      root?.removeEventListener('focusout', onFocusOut);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative" data-tour={tourId}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-11 items-center justify-center rounded-md text-fg transition-colors hover:bg-surface-muted"
      >
        {trigger}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className={cn(
          'absolute right-0 z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-2 shadow-lg',
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
