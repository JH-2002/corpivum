'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { MeasureUnit } from '@/components/health/format';

/** Unidades que um campo de registro pode ter: as das medidas (`MEASURE_UNITS`) e as de tempo e distância. */
export type FieldUnit = MeasureUnit | 'min' | 'km';

/**
 * Explicação de um campo (9d): "o que é", "como medir" (aberto sob demanda) e um exemplo de formato. Os textos
 * vêm de `<módulo>.help.<campo>` (RASCUNHO `LEGAL-REVIEW`, OI-41); a unidade vem do código, nunca do texto.
 */
export interface FieldHelpProps {
  what?: ReactNode;
  howTo?: ReactNode;
  /** Só o número ou o texto do exemplo; "Ex.:" e a unidade são acrescentados aqui. */
  example?: string;
  unit?: FieldUnit;
}

/** "82,5 cm", "18%": o exemplo com a unidade do campo. */
function withUnit(value: string, unit?: FieldUnit): string {
  if (!unit) return value;
  return unit === '%' ? `${value}%` : `${value} ${unit}`;
}

/** Ids que descrevem o controle (`aria-describedby`): o "o que é" e o exemplo. O "como medir" fica no `<details>`. */
export function fieldHelpIds(id: string, help: FieldHelpProps): string[] {
  return [help.what ? `${id}-what` : null, help.example ? `${id}-example` : null].filter(
    (v): v is string => v !== null,
  );
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

export function FieldHelp({ id, what, howTo, example, unit }: FieldHelpProps & { id: string }) {
  const t = useTranslations('fields');
  if (!what && !howTo && !example) return null;
  return (
    <>
      {what ? (
        <p id={`${id}-what`} className="text-sm text-fg-muted">
          {what}
        </p>
      ) : null}
      {howTo ? (
        <details className="text-sm" data-field-how="">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
            {t('howTo')}
          </summary>
          <p className="pb-1 text-fg-muted">{howTo}</p>
        </details>
      ) : null}
      {example ? (
        <p id={`${id}-example`} className="text-sm text-fg-muted">
          {t('example', { value: withUnit(example, unit) })}
        </p>
      ) : null}
    </>
  );
}
