'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'defaultChecked' | 'checked'
> {
  name: string;
  label: ReactNode;
  /** Texto de apoio ligado por aria-describedby. */
  description?: ReactNode;
  error?: string;
}

/**
 * Caixa de seleção nativa, NUNCA pré-marcada (LEG-C02): `checked`/`defaultChecked` não são aceitos.
 * Alvo de 24px com rótulo clicável (WCAG 2.2: 2.5.8), erro em texto e ícone (cor não é o único canal).
 */
export function Checkbox({ name, label, description, error, className, ...input }: CheckboxProps) {
  // Defesa também em tempo de execução: pré-marcação passada por fora do tipo é descartada.
  const {
    defaultChecked: _defaultChecked,
    checked: _checked,
    ...props
  } = input as typeof input & { defaultChecked?: unknown; checked?: unknown };
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={[descriptionId, errorId].filter(Boolean).join(' ') || undefined}
          className="mt-0.5 size-6 shrink-0 accent-primary"
          {...props}
        />
        <label htmlFor={id} className="text-base font-semibold">
          {label}
        </label>
      </div>
      {description ? (
        <div id={descriptionId} className="pl-9 text-sm text-fg-muted">
          {description}
        </div>
      ) : null}
      {error ? (
        <p id={errorId} className="pl-9 text-sm font-semibold text-danger">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
