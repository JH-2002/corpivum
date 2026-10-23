'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { MeasureUnit } from '@/components/health/format';

/** Unidades que um campo de registro pode ter: as das medidas (`MEASURE_UNITS`) e as de tempo e distância. */
export type FieldUnit = MeasureUnit | 'min' | 'km';

/**
 * Explicação de um campo (9d; mais leve na 9d1): uma linha curta com o "o que é" e a dica (faixa aceita), e o
 * "como medir" com o exemplo fechados num `<details>`, abertos só ao clicar. Os textos vêm de
 * `<módulo>.help.<campo>` (RASCUNHO `LEGAL-REVIEW`, OI-41); a unidade vem do código, nunca do texto.
 */
export interface FieldHelpProps {
  what?: ReactNode;
  /** Dica curta na mesma linha do "o que é" (ex.: "Faixa aceita: de 20 a 300."). */
  hint?: ReactNode;
  howTo?: ReactNode;
  /** Só o número ou o texto do exemplo; "Ex.:" e a unidade são acrescentados aqui. */
  example?: string;
  /**
   * O exemplo mostra só o formato ("Formato: 12,3 cm"), não um valor plausível: nas medidas do corpo, um número
   * realista poderia ser lido como referência de corpo (LEG-M06; revisão de privacidade da 9d).
   */
  formatOnly?: boolean;
  unit?: FieldUnit;
}

/** "82,5 cm", "18%": o exemplo com a unidade do campo. */
function withUnit(value: string, unit?: FieldUnit): string {
  if (!unit) return value;
  return unit === '%' ? `${value}%` : `${value} ${unit}`;
}

/**
 * Ids que descrevem o controle (`aria-describedby`): a linha curta (`-what`, ou `-hint` sem "o que é") e o
 * exemplo, que o leitor de tela lê mesmo com o `<details>` fechado. O "como medir" fica só no `<details>`.
 */
export function fieldHelpIds(id: string, help: FieldHelpProps): string[] {
  return [
    help.what ? `${id}-what` : help.hint ? `${id}-hint` : null,
    help.example ? `${id}-example` : null,
  ].filter((v): v is string => v !== null);
}

/** Texto do rótulo lido pelo leitor de tela: a unidade por extenso ("Peso, em quilogramas"). */
export function UnitLabel({ unit }: { unit?: FieldUnit }) {
  const t = useTranslations('fields');
  if (!unit) return null;
  return <span className="sr-only">, {t(`unitSpoken.${UNIT_KEY[unit]}`)}</span>;
}

const UNIT_KEY = {
  kg: 'kg',
  cm: 'cm',
  '%': 'pct',
  ml: 'ml',
  kcal: 'kcal',
  min: 'min',
  km: 'km',
} as const satisfies Record<FieldUnit, string>;

/** Sufixo visual da unidade dentro do campo; o nome acessível já a traz pelo `UnitLabel`. */
export function UnitSuffix({ unit }: { unit?: FieldUnit }) {
  if (!unit) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-fg-muted"
    >
      {unit}
    </span>
  );
}

export function FieldHelp({
  id,
  label,
  what,
  hint,
  howTo,
  example,
  formatOnly,
  unit,
}: FieldHelpProps & {
  id: string;
  /** Nome do campo, para o "Como medir" não se repetir igual no leitor de tela (WCAG 2.4.6). */
  label?: string;
}) {
  const t = useTranslations('fields');
  return (
    <>
      {what || hint ? (
        <p id={`${id}-${what ? 'what' : 'hint'}`} className="text-sm text-fg-muted">
          {what}
          {what && hint ? ' ' : null}
          {hint}
        </p>
      ) : null}
      {howTo || example ? (
        <details className="text-sm" data-field-how="">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
            {t(howTo ? 'howTo' : 'showExample')}
            {label ? <span className="sr-only">: {label}</span> : null}
          </summary>
          {howTo ? <p className="pb-1 text-fg-muted">{howTo}</p> : null}
          {example ? (
            <p id={`${id}-example`} className="pb-1 text-fg-muted">
              {t(formatOnly ? 'format' : 'example', { value: withUnit(example, unit) })}
            </p>
          ) : null}
        </details>
      ) : null}
    </>
  );
}
