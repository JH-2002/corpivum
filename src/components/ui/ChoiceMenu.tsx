'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { lastInputWasPointer } from './programmatic-focus';

export interface ChoiceOption {
  value: string;
  label: string;
}

/**
 * Escolha de uma opção num menu, no estilo do seletor de período (9b): botão com a opção atual e uma lista de
 * rádios nativos (`role="radiogroup"`, setas trocam, nome pelo rótulo). A opção atual tem preenchimento, peso e
 * check (a cor nunca é o único canal). Fecha com Esc (foco volta ao botão), clique fora ou foco saindo; pelo
 * teclado as setas não fecham, só o clique numa opção.
 */
export function ChoiceMenu({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: readonly ChoiceOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const ids = { label: useId(), list: useId() };
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const onPointerDown = (event: PointerEvent) => {
      if (!root?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
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
    <div ref={rootRef} className={cn('relative flex flex-col gap-1', className)}>
      <span id={ids.label} className="text-sm font-semibold">
        {label}
      </span>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={ids.list}
        aria-label={`${label}: ${current?.label ?? ''}`}
        onClick={() => setOpen((v) => !v)}
        className="tabular inline-flex min-h-11 items-center justify-between gap-2 rounded-md border border-border-strong bg-surface px-3 text-sm font-semibold hover:bg-surface-muted"
      >
        {current?.label}
        <ChevronDown
          className={cn('size-4 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      <div
        id={ids.list}
        role="radiogroup"
        aria-labelledby={ids.label}
        className={cn(
          'absolute top-full left-0 z-40 mt-2 max-h-72 w-full min-w-56 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg',
          open ? 'flex' : 'hidden',
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                'tabular rounded relative flex min-h-11 cursor-pointer items-center gap-1.5 px-3 text-sm',
                'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                selected
                  ? 'bg-primary font-semibold text-primary-fg'
                  : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
              )}
            >
              <input
                type="radio"
                name={ids.list}
                value={option.value}
                checked={selected}
                onChange={() => {
                  onChange(option.value);
                  if (lastInputWasPointer()) setOpen(false);
                }}
                className="sr-only"
              />
              <Check
                className={cn('size-4 shrink-0', !selected && 'invisible')}
                aria-hidden="true"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
