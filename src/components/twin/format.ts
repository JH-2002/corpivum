'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { formatDecimal } from '@/components/health/format';

/** "+1,2" / "−0,8" / "0". */
export const signedDecimal = (v: number) =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatDecimal(Math.abs(v))}`;

/**
 * Formatação das telas do twin: data longa e valores com unidade. No modo privacidade (§44/§45,
 * ADR-0026) todo número de medida vira "oculto", sem unidade.
 */
export function useTwinFormat(hideValues: boolean) {
  const format = useFormatter();
  const tc = useTranslations('twin.controls');
  return {
    longDay: (iso: string) =>
      format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: 'long', timeZone: 'UTC' }),
    value: (v: number, unit: string) => (hideValues ? tc('hidden') : `${formatDecimal(v)} ${unit}`),
    signed: (v: number, unit: string) =>
      hideValues ? tc('hidden') : `${signedDecimal(v)} ${unit}`,
  };
}
