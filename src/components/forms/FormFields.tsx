'use client';

import { useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { FieldHelp, fieldHelpIds, UnitLabel, UnitSuffix, type FieldHelpProps } from './FieldHelp';
import type { FormState } from './form-state';

const inputClass =
  'min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-fg ' +
  'aria-[invalid=true]:border-danger';

export interface TextFieldProps
  extends InputHTMLAttributes<HTMLInputElement>, Omit<FieldHelpProps, 'example' | 'hint'> {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  /** Exemplo (9d): "Ex.: 45 min"; com `formatOnly`, "Formato: 12,3 cm". */
  example?: string;
  formatOnly?: boolean;
}

/**
 * Campo com rótulo, explicação (o que é e dica numa linha; como medir e exemplo fechados, 9d1) e erro ligados por
 * aria-describedby (WCAG 2.2: 1.3.1, 3.3.1, 3.3.2). A unidade aparece dentro do campo e entra por extenso no nome
 * acessível.
 */
export function TextField({
  name,
  label,
  hint,
  error,
  className,
  unit,
  what,
  howTo,
  example,
  formatOnly,
  ...props
}: TextFieldProps) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const help = { what, hint, howTo, example, formatOnly, unit };
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
        <UnitLabel unit={unit} />
      </label>
      <FieldHelp id={id} label={label} {...help} />
      <div className="relative">
        <input
          id={id}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [...fieldHelpIds(id, help), errorId].filter(Boolean).join(' ') || undefined
          }
          className={cn(inputClass, unit && 'pr-14')}
          {...props}
        />
        <UnitSuffix unit={unit} />
      </div>
      {error ? (
        <p id={errorId} className="text-sm font-semibold text-danger">
          {/* Ícone textual: a cor nunca é o único canal. */}
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Resumo do resultado: recebe o foco quando aparece, para leitores de tela e teclado. */
export function FormMessage({ state }: { state: FormState }) {
  const t = useTranslations('auth.errors');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status !== 'idle') ref.current?.focus();
  }, [state]);

  if (state.status === 'idle') return null;
  const isError = state.status === 'error';
  const fieldErrors = Object.values(state.fieldErrors ?? {});
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={isError ? 'alert' : 'status'}
      className={cn(
        'rounded-md border p-3 text-sm outline-none focus-visible:ring-2',
        isError ? 'border-danger bg-surface' : 'border-border-strong bg-surface-muted',
      )}
    >
      {isError && fieldErrors.length > 0 && !state.message ? (
        <p className="font-semibold">{t('summaryTitle')}</p>
      ) : null}
      {state.message ? <p className="font-semibold">{state.message}</p> : null}
      {fieldErrors.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {fieldErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  children,
  variant = 'primary',
  className,
  ...rest
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  'aria-label'?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      aria-disabled={pending}
      className={className}
      {...rest}
    >
      {children}
    </Button>
  );
}
