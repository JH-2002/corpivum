import 'server-only';
import { createFormatter, createTranslator } from 'next-intl';
import { messages } from '@/i18n/messages';
import { APP_TIME_ZONE } from '@/lib/dates';
import { formatIsoDate } from '@/lib/period';
import { buildZip, toCsv, type Cell, type ReportModel } from '@/modules/reports';
import type { ReportRenderers } from '@/modules/reports/service';
import { reportDocument, type ReportDocument, type ReportTranslate } from './document';
import { renderReportPdf } from './pdf';

/**
 * Arquivos do relatório gerados FORA de uma requisição (job `reports.generate`, ADR-0032): tradutor e
 * formatador do next-intl criados aqui, com o mesmo catálogo e fuso da interface. PDF, JSON e CSV saem do
 * mesmo `ReportDocument` que a tela mostra, com o rodapé fixo (`disclaimer.reportFooter`).
 */
const LOCALE = 'pt-BR';
const t = createTranslator({ locale: LOCALE, messages }) as unknown as ReportTranslate;
const format = createFormatter({ locale: LOCALE, timeZone: APP_TIME_ZONE });
const encoder = new TextEncoder();

const REPORT_SCHEMA_VERSION = 1;

function documentOf(model: ReportModel, today: string): ReportDocument {
  return reportDocument(model, t, format, today);
}

export function reportJson(model: ReportModel, today: string): Uint8Array<ArrayBuffer> {
  const doc = documentOf(model, today);
  const out = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    kind: 'report',
    period: model.period,
    range: model.range,
    generatedOn: today,
    source: model.source,
    hideBodyValues: model.hideBodyValues,
    notice: doc.footer,
    title: doc.title,
    notices: doc.notices,
    score: { ...doc.score, value: model.score.value, version: model.score.version },
    sections: doc.sections,
    charts: model.charts.map((c) => ({
      id: c.id,
      unit: c.unit,
      bucket: c.bucket,
      badge: model.source === 'demo' ? 'DEMO' : c.badge,
      points: c.points,
    })),
    goals: doc.goals,
  };
  return encoder.encode(`${JSON.stringify(out, null, 2)}\n`);
}

export function reportCsv(model: ReportModel, today: string): Uint8Array<ArrayBuffer> {
  const doc = documentOf(model, today);
  const summary: Cell[][] = [
    ...doc.notices.map((n): Cell[] => ['notice', '', n]),
    ...doc.score.lines.map((l): Cell[] => ['score', doc.score.title, l]),
    ...(doc.score.badge ? [['score', doc.score.title, doc.score.badge] as Cell[]] : []),
    ...doc.sections.flatMap((s) => [
      ...s.sentences.map((x): Cell[] => ['summary', s.heading, x]),
      ...s.highlights.map((h): Cell[] => [
        'highlight',
        s.heading,
        `${h.label}: ${h.value}${h.detail ? ` (${h.detail})` : ''}. ${h.badge}`,
      ]),
    ]),
    ...doc.goals.lines.map((l): Cell[] => ['goal', doc.goals.title, l]),
    ['goal', doc.goals.title, doc.goals.note],
  ];
  const charts = model.charts.map((c) => ({
    name: `chart_${c.id}.csv`,
    data: encoder.encode(
      toCsv(
        [c.bucket === 'day' ? 'day' : 'weekStart', `value_${c.unit}`],
        c.points.map((p) => [p.day, p.value]),
      ),
    ),
  }));
  const readme = [doc.footer, '', doc.title, doc.range, ...doc.notices].join('\r\n');
  return buildZip(
    [
      { name: 'README.txt', data: encoder.encode(`\uFEFF${readme}\r\n`) },
      { name: 'summary.csv', data: encoder.encode(toCsv(['type', 'section', 'text'], summary)) },
      ...charts,
    ],
    new Date(),
  );
}

export async function reportPdf(
  model: ReportModel,
  today: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const doc = documentOf(model, today);
  return renderReportPdf(doc, {
    title: t('reports.pdf.title', { heading: doc.title }),
    pageLabel: (page, total) => t('reports.pdf.page', { page, total }),
    created: new Date(),
  });
}

export const reportRenderers: ReportRenderers = {
  notice: (today) => t('disclaimer.reportFooter', { date: formatIsoDate(today) }),
  reportPdf,
  reportJson,
  reportCsv,
};
