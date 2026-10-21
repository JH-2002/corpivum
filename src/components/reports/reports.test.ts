// @vitest-environment node
import { inflateSync } from 'node:zlib';
import { createFormatter, createTranslator } from 'next-intl';
import { PDFDocument, PDFArray, PDFName, PDFRawStream, type PDFPage } from 'pdf-lib';
import { messages } from '@/i18n/messages';
import { generateDemoData } from '@/modules/demo/generator';
import { createDemoSource } from '@/modules/health/source';
import { buildReport, calendarRange, mentionsInternalValue, readZip } from '@/modules/reports';
import type { ReportPeriod } from '@/modules/reports';
import { findForbiddenTerms } from '../../../tests/content/forbidden-terms';
import { reportDocument, type ReportDocument, type ReportTranslate } from './document';
import { reportCsv, reportJson, reportPdf } from './render';

/**
 * Relatórios (§29, ADR-0032) com o catálogo real e dados 100% fictícios do demo: texto sem alegação proibida
 * (LEG-M03), sem IMC nem relação cintura/quadril (LEG-M06), valores do corpo ocultáveis e rodapé fixo em
 * todas as páginas do PDF.
 */
const TODAY = '2026-10-14';
const TZ = 'America/Sao_Paulo';
const t = createTranslator({ locale: 'pt-BR', messages }) as unknown as ReportTranslate;
const format = createFormatter({ locale: 'pt-BR', timeZone: TZ });
const source = createDemoSource(generateDemoData(TODAY, TZ));
const decoder = new TextDecoder();

async function model(period: ReportPeriod, hideBodyValues = false) {
  return buildReport(source, {
    period,
    range: calendarRange(period, TODAY, TODAY),
    today: TODAY,
    hideBodyValues,
  });
}

function allText(doc: ReportDocument): string {
  return [
    doc.title,
    doc.range,
    ...doc.notices,
    doc.score.title,
    ...doc.score.lines,
    doc.score.badge ?? '',
    ...doc.sections.flatMap((s) => [
      s.heading,
      ...s.sentences,
      ...s.highlights.flatMap((h) => [h.label, h.value, h.detail ?? '', h.badge]),
    ]),
    ...doc.charts.flatMap((c) => [c.title, c.caption, ...c.columns, ...c.rows.map((r) => r.text)]),
    doc.goals.title,
    ...doc.goals.lines,
    doc.goals.note,
    doc.footer,
  ].join('\n');
}

/** Texto de uma página do PDF: desfaz o Flate e junta as strings hexadecimais dos operadores Tj. */
function pageText(page: PDFPage): string {
  const contents = page.node.get(PDFName.of('Contents'));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  let ops = '';
  for (const ref of refs) {
    const stream = page.doc.context.lookup(ref);
    if (!(stream instanceof PDFRawStream)) continue;
    const raw = stream.getContents();
    const filter = stream.dict.get(PDFName.of('Filter'));
    ops += Buffer.from(filter ? inflateSync(raw) : raw).toString('latin1');
  }
  return [...ops.matchAll(/<([0-9A-Fa-f]*)> Tj/g)]
    .map((m) => Buffer.from(m[1] ?? '', 'hex').toString('latin1'))
    .join(' ');
}

describe.each(['week', 'month', 'year'] as const)('relatório %s', (period) => {
  it('texto sem termo proibido, sem valor só interno e com o rodapé fixo', async () => {
    const doc = reportDocument(await model(period), t, format, TODAY);
    const text = allText(doc);
    // Avisos obrigatórios `disclaimer.*` (rodapé, Índice) têm negações e são isentos do glossário (ADR-0004).
    const disclaimers = new Set([doc.footer, t('disclaimer.wellbeingScore')]);
    const checked = text
      .split(/\r?\n/)
      .filter((line) => !disclaimers.has(line))
      .join(' ');
    expect(findForbiddenTerms(checked).map((x) => x.id)).toEqual([]);
    expect(mentionsInternalValue(text)).toBe(false);
    expect(text).not.toMatch(/\bIMC\b|cintura\s*\/\s*quadril/i);
    expect(doc.footer).toBe(
      'Gerado em 14/10/2026. Material de autoacompanhamento, não é laudo nem avaliação clínica.',
    );
    expect(doc.sections.map((s) => s.module)).toEqual([
      'sleep',
      'habits',
      'body',
      'nutrition',
      'activity',
      'goals',
    ]);
    // Demo: selo DEMO em tudo.
    expect(doc.notices[0]).toContain('fictícios');
    for (const c of doc.charts) expect(c.badge).toContain('Demo');
  });
});

describe('modelo do relatório', () => {
  it('ano usa média/total por semana; semana usa dias', async () => {
    const year = await model('year');
    expect(year.charts.every((c) => c.bucket === 'week')).toBe(true);
    const week = await model('week');
    expect(week.charts.every((c) => c.bucket === 'day')).toBe(true);
  });

  it('valores do corpo ocultos: sem gráfico de peso e sem kg/cm/kcal no texto', async () => {
    const m = await model('month', true);
    expect(m.charts.map((c) => c.id)).not.toContain('weight');
    const doc = reportDocument(m, t, format, TODAY);
    const body = doc.sections.find((s) => s.module === 'body');
    expect(body?.sentences.join(' ')).toMatch(/ocultos/);
    expect(allText(doc)).not.toMatch(/\d\s?(kg|cm|kcal)\b/);
    expect(doc.notices).toContain(t('reports.hidden'));
  });

  it('metas de peso e de calorias nunca aparecem com número', async () => {
    const m = await model('month');
    expect(m.goals.map((g) => g.metric)).not.toContain('weight_kg');
    expect(m.goals.map((g) => g.metric)).not.toContain('kcal_reference_day');
  });
});

describe('arquivos do relatório', () => {
  it('PDF: rodapé fixo e número da página em TODAS as páginas, sem IMC', async () => {
    const bytes = await reportPdf(await model('year'), TODAY);
    expect(decoder.decode(bytes.subarray(0, 5))).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes);
    const pages = pdf.getPages();
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((page, i) => {
      const text = pageText(page);
      expect(text).toContain('Material de autoacompanhamento');
      expect(text).toContain(`Página ${i + 1} de ${pages.length}`);
      expect(text).not.toMatch(/\bIMC\b/);
    });
    expect(pdf.getTitle()).toContain('Relatório anual');
  });

  it('JSON e CSV: rodapé, sem valores só internos', async () => {
    const m = await model('month');
    const json = decoder.decode(reportJson(m, TODAY));
    expect(JSON.parse(json)).toMatchObject({ schemaVersion: 1, kind: 'report', period: 'month' });
    expect(json).toContain('não é laudo');
    expect(mentionsInternalValue(json)).toBe(false);
    const files = readZip(reportCsv(m, TODAY));
    expect(files.map((f) => f.name)).toEqual(
      expect.arrayContaining(['README.txt', 'summary.csv', 'chart_sleep.csv']),
    );
    for (const f of files)
      expect(mentionsInternalValue(decoder.decode(f.data)), f.name).toBe(false);
    expect(decoder.decode(files[0]?.data)).toContain('não é laudo');
  });
});
