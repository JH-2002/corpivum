import { useFormatter, useTranslations } from 'next-intl';
import { formatDecimal, formatDuration } from '@/components/health/format';
import { weekday } from '@/lib/dates';
import type {
  Highlight,
  InsightArg,
  InsightArgs,
  InsightModule,
  InsightSentence,
} from '@/modules/insights';

/**
 * Monta o texto da camada explicativa (ADR-0025) a partir das chaves e argumentos de `@/modules/insights`.
 * Funciona em Server e Client Components (hooks síncronos do next-intl).
 */
export function useInsightText(module: InsightModule) {
  const t = useTranslations('insights');
  const format = useFormatter();
  type Key = Parameters<typeof t>[0];

  const dayLabel = (iso: string, style: 'weekday' | 'date') =>
    style === 'weekday'
      ? t('days.weekday', { wd: String(weekday(iso)) })
      : t('days.date', {
          date: format.dateTime(new Date(`${iso}T12:00:00Z`), {
            day: 'numeric',
            month: 'long',
            timeZone: 'UTC',
          }),
        });

  function arg(a: InsightArg): string | number {
    switch (a.kind) {
      case 'int':
        return a.value;
      case 'decimal':
        return formatDecimal(a.value);
      case 'signed':
        return `${a.value > 0 ? '+' : a.value < 0 ? '−' : ''}${formatDecimal(Math.abs(a.value))}`;
      case 'duration':
        return formatDuration(a.value);
      case 'days':
        return format.list(
          a.value.map((d) => dayLabel(d, a.style)),
          { type: 'conjunction' },
        );
      case 'field':
        return t(`body.fields.${a.value}`);
      case 'select':
        return a.value;
    }
  }

  const values = (args: InsightArgs) =>
    Object.fromEntries(Object.entries(args).map(([k, v]) => [k, arg(v)]));

  return {
    /** Frase do resumo (`insights.<módulo>.<chave>`). */
    sentence: (s: InsightSentence) => t(`${module}.${s.key}` as Key, values(s.args)),
    /** Rótulo e detalhe de um destaque (`insights.<módulo>.highlights.*`). */
    highlightLabel: (h: Highlight) => t(`${module}.highlights.${h.key}` as Key),
    highlightDetail: (h: Highlight) =>
      h.detail ? t(`${module}.highlights.${h.detail.key}` as Key, values(h.detail.args)) : null,
    value: (a: InsightArg) => String(arg(a)),
  };
}
