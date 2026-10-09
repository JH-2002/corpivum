import { useTranslations } from 'next-intl';
import type { ConfidenceLevel } from '@/components/ui/ConfidenceBadge';
import type { ChartSeries } from './TimeChart';

/** Gráficos com texto próprio em `charts.guide.<id>` (eixos e o que fazer com a informação). */
export const CHART_GUIDES = [
  'combined',
  'sleepDuration',
  'sleepSchedule',
  'habits',
  'weight',
  'girth',
] as const;
export type ChartGuideId = (typeof CHART_GUIDES)[number];

/** Padrão de traço em palavras: o guia não depende da cor (WCAG 1.4.1). */
export function dashPattern(dash: string | undefined): 'solid' | 'dotted' | 'dashed' {
  if (!dash) return 'solid';
  const first = Number(dash.split(' ')[0]);
  return first <= 2 ? 'dotted' : 'dashed';
}

/**
 * "Como ler este gráfico" (ADR-0025): o que cada eixo, série (tipo, traço, eixo, unidade) e selo
 * representam, e o que fazer com a informação. `<details>` nativo: abre com teclado e toque, sem JS.
 * As séries são descritas a partir das mesmas definições usadas no desenho, então não desatualizam.
 */
export function ChartGuide({
  id,
  series = [],
  badge,
}: {
  id: ChartGuideId;
  series?: readonly ChartSeries[];
  badge: ConfidenceLevel;
}) {
  const t = useTranslations('charts.guide');
  const tb = useTranslations('badges');
  const twoAxes = series.some((s) => s.axis === 'right');
  return (
    <details className="text-sm" data-tour="chart-guide">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
        {t('title')}
      </summary>
      <div className="flex flex-col gap-2 pt-1">
        <p>{t('xAxis')}</p>
        <p>{t(`${id}.axes`)}</p>
        {series.length > 0 ? (
          <>
            <p className="font-semibold">{t('seriesTitle')}</p>
            <ul className="list-disc pl-5">
              {series.map((s) => (
                <li key={s.key}>
                  {t('series', {
                    label: s.label,
                    kind: s.kind,
                    pattern: dashPattern(s.dash),
                    axis: twoAxes ? (s.axis ?? 'left') : 'single',
                    unit: s.unit ?? 'none',
                  })}
                </li>
              ))}
            </ul>
            <p>{t('colorNote')}</p>
          </>
        ) : null}
        <p>{t('badge', { badge: tb(badge), hint: tb(`${badge}_hint`) })}</p>
        <p>{t('tableNote')}</p>
        <p className="font-semibold">{t('whatToDoTitle')}</p>
        <p>{t(`${id}.whatToDo`)}</p>
      </div>
    </details>
  );
}
