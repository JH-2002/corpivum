'use client';

import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { ChoiceMenu } from '@/components/ui/ChoiceMenu';
import { cn } from '@/lib/cn';
import { FieldHelp, fieldHelpIds, type FieldHelpProps } from './FieldHelp';

/**
 * Campos dos formulários de registro (Fase 2). Rótulo, dica e erro ligados por aria-describedby
 * (WCAG 1.3.1, 3.3.1, 3.3.2); erro com ícone textual (cor não é o único canal); alvos ≥ 44px.
 * Diferente de `Checkbox` (consentimento, nunca pré-marcado), aqui a edição precisa trazer o valor salvo.
 */
const controlClass =
  'min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-fg ' +
  'aria-[invalid=true]:border-danger';

function Described({ id, hint, error }: { id: string; hint?: ReactNode; error?: string }) {
  return (
    <>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-semibold text-danger">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      ) : null}
    </>
  );
}

function describedBy(
  id: string,
  hint?: ReactNode,
  error?: string,
  help: FieldHelpProps = {},
): string | undefined {
  return (
    [...fieldHelpIds(id, help), hint ? `${id}-hint` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined
  );
}

/**
 * Escolha de uma opção no estilo do app (9d0): o `ChoiceMenu` dos seletores, no lugar do `<select>` nativo, que
 * abria a lista do sistema com outra aparência. O valor vai no envio do formulário pelo `name`, como antes.
 */
export function SelectField({
  name,
  label,
  hint,
  error,
  options,
  className,
  value,
  defaultValue,
  onValueChange,
  what,
  howTo,
}: Pick<FieldHelpProps, 'what' | 'howTo'> & {
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  className?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <ChoiceMenu
        name={name}
        label={label}
        options={options}
        value={value}
        defaultValue={defaultValue}
        onChange={onValueChange}
        describedBy={describedBy(id, hint, error, { what })}
        invalid={Boolean(error)}
        help={<FieldHelp id={id} what={what} howTo={howTo} />}
      />
      <Described id={id} hint={hint} error={error} />
    </div>
  );
}

export function TextAreaField({
  name,
  label,
  hint,
  error,
  className,
  what,
  example,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> &
  Pick<FieldHelpProps, 'what' | 'example'> & {
    name: string;
    label: string;
    hint?: ReactNode;
    error?: string;
  }) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <FieldHelp id={id} what={what} example={example} />
      <Described id={id} hint={hint} />
      <textarea
        id={id}
        name={name}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error, { what, example })}
        className={cn(controlClass, 'py-2')}
        {...props}
      />
      <Described id={id} error={error} />
    </div>
  );
}

/** Escala 1–5 como grupo de rádios (fieldset + legend), com o significado das pontas em texto. */
export function ScaleField({
  name,
  legend,
  low,
  high,
  defaultValue,
  required,
  error,
  what,
}: Pick<FieldHelpProps, 'what'> & {
  name: string;
  legend: string;
  low: string;
  high: string;
  defaultValue?: number | null;
  required?: boolean;
  error?: string;
}) {
  const id = useId();
  return (
    <fieldset
      className="flex flex-col gap-1"
      aria-describedby={[...fieldHelpIds(id, { what }), `${id}-ends`, error ? `${id}-error` : null]
        .filter(Boolean)
        .join(' ')}
    >
      <legend className="text-sm font-semibold">{legend}</legend>
      <FieldHelp id={id} what={what} />
      <p id={`${id}-ends`} className="text-sm text-fg-muted">
        1 = {low} · 5 = {high}
      </p>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((v) => (
          <label
            key={v}
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-md border border-border-strong px-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:font-bold"
          >
            <input
              type="radio"
              name={name}
              value={v}
              defaultChecked={defaultValue === v}
              required={required}
              className="size-4 accent-primary"
            />
            {v}
          </label>
        ))}
      </div>
      <Described id={id} error={error} />
    </fieldset>
  );
}

/** Grupo de caixas de seleção de uma lista fechada (etiquetas, dias da semana). */
export function OptionGroup({
  name,
  legend,
  hint,
  options,
  defaultValues = [],
}: {
  name: string;
  legend: string;
  hint?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  defaultValues?: readonly string[];
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-1" aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend className="text-sm font-semibold">{legend}</legend>
      <Described id={id} hint={hint} />
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:font-semibold"
          >
            <input
              type="checkbox"
              name={name}
              value={o.value}
              defaultChecked={defaultValues.includes(o.value)}
              className="size-4 accent-primary"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
