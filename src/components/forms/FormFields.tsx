'use client';

import { useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { FormState } from './form-state';

const inputClass =
  'min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-fg ' +
  'aria-[invalid=true]:border-danger';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  name: string;
  label: string;
  hint?: string;
  error?: string;
}

/** Campo com rótulo, dica e erro ligados por aria-describedby (WCAG 2.2: 1.3.1, 3.3.1, 3.3.2). */
export function TextField({ name, label, hint, error, className, ...props }: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={inputClass}
        {...props}
      />
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
