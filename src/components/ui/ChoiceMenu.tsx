'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
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
 *
 * Em formulário (`name`), os rádios levam o nome do campo e o valor marcado vai no envio, como num `<select>`;
 * dentro de `<fieldset disabled>` (exemplo da demo), botão e rádios ficam desativados juntos. Sem `value`, guarda
 * a escolha sozinho a partir de `defaultValue`.
 */
export function ChoiceMenu({
  label,
  value,
  defaultValue,
  options,
  onChange,
  name,
  describedBy,
  invalid = false,
  className,
  help,
}: {
  label: string;
  value?: string;
  defaultValue?: string;
  options: readonly ChoiceOption[];
  onChange?: (value: string) => void;
  /** Nome do campo no envio do formulário. */
  name?: string;
  /** Ids da dica e do erro do campo: descrevem o botão e o grupo de opções (`aria-invalid` vai no grupo, onde vale). */
  describedBy?: string;
  invalid?: boolean;
  className?: string;
  /** Explicação do campo (9d), entre o rótulo e o botão, como nos campos de texto. */
  help?: ReactNode;
}) {
  const ids = { label: useId(), list: useId() };
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState(defaultValue ?? options[0]?.value ?? '');
  // Novo `defaultValue` (o formulário passou a outro registro): a escolha volta a ele, como num `<select>`.
  const [lastDefault, setLastDefault] = useState(defaultValue);
  if (defaultValue !== lastDefault) {
    setLastDefault(defaultValue);
    setOwn(defaultValue ?? options[0]?.value ?? '');
  }
  const selectedValue = value ?? own;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === selectedValue) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const onPointerDown = (event: PointerEvent) => {
      if (!root?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // Esc fecha; Enter numa opção também (dentro de formulário, o Enter num rádio enviaria o registro).
      const onOption = event.target instanceof HTMLInputElement && root?.contains(event.target);
      if (event.key !== 'Escape' && !(event.key === 'Enter' && onOption)) return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onFocusOut = (event: FocusEvent) => {
      // Só fecha quando o foco vai para outro elemento fora daqui. O clique no rótulo de uma opção (que não recebe
      // foco) leva o foco a um ancestral focável (`<main tabIndex={-1}>`) ou a lugar nenhum, e o clique ainda vai
      // chegar à opção; clique fora já fecha pelo `pointerdown`.
      const next = event.relatedTarget as Node | null;
      if (!root || !next || root.contains(next) || next.contains(root)) return;
      setOpen(false);
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
      {help}
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={ids.list}
        aria-label={`${label}: ${current?.label ?? ''}`}
        aria-describedby={describedBy}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'tabular inline-flex min-h-11 items-center justify-between gap-2 rounded-md border bg-surface px-3 text-sm font-semibold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-surface',
          invalid ? 'border-danger' : 'border-border-strong',
        )}
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
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className={cn(
          'absolute top-full left-0 z-40 mt-2 max-h-72 w-full min-w-56 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg',
          open ? 'flex' : 'hidden',
        )}
      >
        {options.map((option) => {
          const selected = option.value === current?.value;
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
                name={name ?? ids.list}
                value={option.value}
                checked={selected}
                onChange={() => {
                  if (value === undefined) setOwn(option.value);
                  onChange?.(option.value);
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
