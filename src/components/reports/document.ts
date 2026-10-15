import { formatDecimal, formatDuration } from '@/components/health/format';
import { insightText, type InsightFormat, type InsightTranslate } from '@/components/insights/text';
import { formatIsoDate } from '@/lib/period';
import type { InsightModule } from '@/modules/insights';
import type { ReportChart, ReportModel } from '@/modules/reports';

/**
 * Texto do relatório (§29, ADR-0032) a partir do modelo: o mesmo documento vira a tela e o PDF, então os dois
 * dizem exatamente a mesma coisa. Recebe o tradutor da RAIZ do catálogo (hook na tela, `createTranslator` no
 * job). Sem valores só internos (LEG-M06) e sem sugestão (ADR-0030): só o que o modelo descreve.
 */
export interface ReportDocument {
  title: string;
  range: string;
  notices: string[];
  score: { title: string; lines: string[]; badge: string | null };
  sections: {
    module: InsightModule;
    heading: string;
    sentences: string[];
    highlights: { label: string; value: string; detail: string | null; badge: string }[];
  }[];
  charts: {
    id: ReportChart['id'];
    title: string;
    caption: string;
    unit: string;
    badge: string;
    columns: [string, string];
    rows: { day: string; label: string; value: number | null; text: string }[];
  }[];
  goals: { title: string; lines: string[]; note: string };
  footer: string;
}

export type ReportTranslate = InsightTranslate;

const SECTION_KEYS: Partial<Record<InsightModule, string>> = {
  sleep: 'reports.sections.sleep',
  habits: 'reports.sections.habits',
  body: 'reports.sections.body',
  nutrition: 'reports.sections.nutrition',
  activity: 'reports.sections.activity',
  goals: 'reports.sections.goals',
};

function chartValue(chart: ReportChart, value: number | null): string {
  if (value === null) return '';
  return chart.unit === 'min' ? formatDuration(value) : `${formatDecimal(value)} ${chart.unit}`;
}

export function reportDocument(
  model: ReportModel,
  t: ReportTranslate,
  format: InsightFormat,
  generatedOn: string,
): ReportDocument {
  const demo = model.source === 'demo';
  const badge = (level: 'INFORMADO' | 'ESTIMADO') =>
    t('reports.badge', { badge: t(`badges.${demo ? 'DEMO' : level}`) });
  const heading = t(`reports.heading.${model.period}`);
  const insights: InsightTranslate = (key, values) => t(`insights.${key}`, values);

  const notices = [
    ...(demo ? [t('reports.demoNotice')] : []),
    ...(model.hideBodyValues ? [t('reports.hidden')] : []),
  ];

  const score = model.score;
  const scoreLines =
    score.value === null
      ? [t('reports.score.none')]
      : [
          t('reports.score.value', { value: score.value }),
          ...(score.partial ? [t('reports.score.partial')] : []),
          t('disclaimer.wellbeingScore'),
        ];

  const sections = model.sections.map((s) => {
    const text = insightText(s.module, insights, format);
    return {
      module: s.module,
      heading: t(SECTION_KEYS[s.module] ?? 'reports.sections.goals'),
      sentences: s.sentences.map(text.sentence),
      highlights: s.highlights.map((h) => ({
        label: text.highlightLabel(h),
        value: text.value(h.value),
        detail: text.highlightDetail(h),
        badge: badge(h.level),
      })),
    };
  });

  const charts = model.charts.map((c) => ({
    id: c.id,
    title: t(`reports.charts.${c.id}`),
    caption: t(
      c.bucket === 'day'
        ? 'reports.charts.bucketDay'
        : c.id === 'activity'
          ? 'reports.charts.bucketWeekSum'
          : 'reports.charts.bucketWeekMean',
    ),
    unit: c.unit,
    badge: badge(c.badge),
    columns: [t('reports.charts.colDay'), t('reports.charts.colValue', { unit: c.unit })] as [
      string,
      string,
    ],
    rows: c.points.map((p) => ({
      day: p.day,
      label: formatIsoDate(p.day),
      value: p.value,
      text: p.value === null ? t('reports.charts.empty') : chartValue(c, p.value),
    })),
  }));

  const goalLines = model.goals.map(
    (g) =>
      t('reports.goals.line', {
        metric: t(`goals.metrics.${g.metric}`),
        current:
          g.current === null
            ? t('reports.goals.noCurrent')
            : g.metric === 'sleep_avg_minutes'
              ? formatDuration(g.current)
              : formatDecimal(g.current),
        target:
          g.metric === 'sleep_avg_minutes' ? formatDuration(g.target) : formatDecimal(g.target),
      }) + (g.reached ? ` (${t('reports.goals.reached')})` : ''),
  );

  return {
    title: heading,
    range: t('reports.range', {
      from: formatIsoDate(model.range.from),
      to: formatIsoDate(model.range.to),
    }),
    notices,
    score: {
      title: t('reports.score.title'),
      lines: scoreLines,
      badge: score.value === null ? null : badge('ESTIMADO'),
    },
    sections,
    charts,
    goals: {
      title: t('reports.goals.title'),
      lines: goalLines.length > 0 ? goalLines : [t('reports.goals.none')],
      note: t('reports.goals.weightNote'),
    },
    footer: t('disclaimer.reportFooter', { date: formatIsoDate(generatedOn) }),
  };
}
