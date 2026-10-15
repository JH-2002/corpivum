import 'server-only';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ReportDocument } from './document';

/**
 * PDF do relatório (§29, ADR-0032), gerado no servidor com `pdf-lib`: sem rede, sem fonte externa (Helvetica
 * padrão, WinAnsi, que cobre o português) e sem imagem. Rodapé fixo em TODA página (`disclaimer.reportFooter`
 * + "Página X de Y"). Gráficos em vetor, sempre seguidos da tabela com os valores (a cor nunca é o único canal).
 * O PDF não é marcado (tagged) para leitor de tela: a versão acessível é a página `/relatorios`.
 */
const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const FOOTER_SPACE = 44;
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.38, 0.4, 0.45);
const LINE = rgb(0.75, 0.77, 0.8);
const SERIES = rgb(0.13, 0.36, 0.62);

/** Gráfico de cada seção. */
const CHART_OF: Partial<Record<string, ReportDocument['charts'][number]['id']>> = {
  sleep: 'sleep',
  activity: 'activity',
  body: 'weight',
};

/** Troca caracteres fora do WinAnsi por equivalentes e descarta o resto (nada de exceção no meio do PDF). */
export function winAnsi(text: string, supported: ReadonlySet<number>): string {
  const mapped = text
    .replace(/[−‐-–]/g, '-')
    .replace(/—/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[  ]/g, ' ')
    .replace(/[▲▴]/g, '+')
    .replace(/[▼▾]/g, '-');
  return [...mapped].filter((ch) => supported.has(ch.codePointAt(0) ?? 0)).join('');
}

interface Writer {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  clean: (text: string) => string;
}

function newPage(w: Writer): void {
  w.page = w.doc.addPage(A4);
  w.y = A4[1] - MARGIN;
}

function ensure(w: Writer, height: number): void {
  if (w.y - height < MARGIN + FOOTER_SPACE) newPage(w);
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function paragraph(
  w: Writer,
  text: string,
  opts: { size?: number; bold?: boolean; color?: typeof INK; gap?: number } = {},
): void {
  const size = opts.size ?? 10;
  const font = opts.bold ? w.bold : w.regular;
  const leading = size * 1.35;
  for (const line of wrap(font, w.clean(text), size, A4[0] - 2 * MARGIN)) {
    ensure(w, leading);
    w.y -= leading;
    w.page.drawText(line, { x: MARGIN, y: w.y, size, font, color: opts.color ?? INK });
  }
  w.y -= opts.gap ?? 4;
}

function chart(w: Writer, c: ReportDocument['charts'][number]): void {
  const values = c.rows.map((r) => r.value).filter((v): v is number => v !== null);
  if (values.length === 0) return;
  const height = 120;
  ensure(w, height + 30);
  const left = MARGIN + 36;
  const right = A4[0] - MARGIN;
  const top = w.y - 8;
  const bottom = top - height;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (c.id !== 'weight') min = Math.min(0, min);
  if (max === min) max = min + 1;
  const xAt = (i: number) =>
    c.rows.length === 1 ? (left + right) / 2 : left + ((right - left) * i) / (c.rows.length - 1);
  const yAt = (v: number) => bottom + ((v - min) / (max - min)) * height;

  w.page.drawLine({ start: { x: left, y: bottom }, end: { x: right, y: bottom }, color: LINE });
  w.page.drawLine({ start: { x: left, y: bottom }, end: { x: left, y: top }, color: LINE });
  for (const v of [min, max]) {
    const label = w.clean(`${Math.round(v * 10) / 10}`);
    w.page.drawText(label, { x: MARGIN, y: yAt(v) - 3, size: 7, font: w.regular, color: MUTED });
  }
  let prev: { x: number; y: number } | null = null;
  c.rows.forEach((r, i) => {
    if (r.value === null) {
      prev = null; // lacuna: sem linha cruzando dias sem registro
      return;
    }
    const point = { x: xAt(i), y: yAt(r.value) };
    if (prev) w.page.drawLine({ start: prev, end: point, thickness: 1.5, color: SERIES });
    w.page.drawCircle({ x: point.x, y: point.y, size: 1.8, color: SERIES });
    prev = point;
  });
  const first = c.rows[0];
  const last = c.rows[c.rows.length - 1];
  if (first && last) {
    w.page.drawText(w.clean(first.label), {
      x: left,
      y: bottom - 11,
      size: 7,
      font: w.regular,
      color: MUTED,
    });
    const lastLabel = w.clean(last.label);
    w.page.drawText(lastLabel, {
      x: right - w.regular.widthOfTextAtSize(lastLabel, 7),
      y: bottom - 11,
      size: 7,
      font: w.regular,
      color: MUTED,
    });
  }
  w.y = bottom - 22;
}

function table(w: Writer, c: ReportDocument['charts'][number]): void {
  const size = 8;
  const leading = 11;
  const colWidth = (A4[0] - 2 * MARGIN) / 3;
  const rows = c.rows.filter((r) => r.value !== null);
  const perColumn = Math.ceil(rows.length / 3);
  ensure(w, leading * 2);
  w.y -= leading;
  for (let col = 0; col < 3; col++) {
    w.page.drawText(w.clean(`${c.columns[0]} | ${c.columns[1]}`), {
      x: MARGIN + col * colWidth,
      y: w.y,
      size,
      font: w.bold,
      color: INK,
    });
  }
  for (let i = 0; i < perColumn; i++) {
    ensure(w, leading);
    w.y -= leading;
    for (let col = 0; col < 3; col++) {
      const r = rows[col * perColumn + i];
      if (!r) continue;
      w.page.drawText(w.clean(`${r.label} | ${r.text}`), {
        x: MARGIN + col * colWidth,
        y: w.y,
        size,
        font: w.regular,
        color: INK,
      });
    }
  }
  w.y -= 8;
}

export async function renderReportPdf(
  report: ReportDocument,
  meta: { title: string; pageLabel: (page: number, total: number) => string; created: Date },
): Promise<Uint8Array<ArrayBuffer>> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(regular.getCharacterSet());
  const clean = (text: string) => winAnsi(text, supported);
  doc.setTitle(clean(meta.title), { showInWindowTitleBar: true });
  doc.setLanguage('pt-BR');
  doc.setCreator('HealthMind 360');
  doc.setProducer('HealthMind 360');
  doc.setCreationDate(meta.created);
  doc.setModificationDate(meta.created);

  const w: Writer = { doc, page: doc.addPage(A4), y: A4[1] - MARGIN, regular, bold, clean };
  paragraph(w, meta.title, { size: 16, bold: true, gap: 2 });
  paragraph(w, report.range, { size: 11, color: MUTED, gap: 10 });
  for (const notice of report.notices) paragraph(w, notice, { size: 9, color: MUTED });

  paragraph(w, report.score.title, { size: 13, bold: true, gap: 2 });
  for (const line of report.score.lines) paragraph(w, line, { size: 9 });
  if (report.score.badge) paragraph(w, report.score.badge, { size: 8, color: MUTED });
  w.y -= 6;

  for (const section of report.sections) {
    ensure(w, 40);
    paragraph(w, section.heading, { size: 13, bold: true, gap: 2 });
    for (const s of section.sentences) paragraph(w, s);
    for (const h of section.highlights) {
      paragraph(w, `${h.label}: ${h.value}${h.detail ? ` (${h.detail})` : ''}. ${h.badge}`, {
        size: 9,
        color: MUTED,
      });
    }
    const c = report.charts.find((x) => x.id === CHART_OF[section.module]);
    if (c) {
      paragraph(w, `${c.title} · ${c.caption}`, { size: 10, bold: true, gap: 0 });
      paragraph(w, c.badge, { size: 8, color: MUTED, gap: 0 });
      chart(w, c);
      table(w, c);
    }
    w.y -= 6;
  }

  ensure(w, 40);
  paragraph(w, report.goals.title, { size: 13, bold: true, gap: 2 });
  for (const line of report.goals.lines) paragraph(w, line);
  paragraph(w, report.goals.note, { size: 9, color: MUTED });

  // Rodapé fixo em todas as páginas (SPEC_ADDENDUM §29), depois de saber o total de páginas.
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    page.drawLine({
      start: { x: MARGIN, y: MARGIN + 18 },
      end: { x: A4[0] - MARGIN, y: MARGIN + 18 },
      color: LINE,
    });
    const footer = wrap(regular, clean(report.footer), 8, A4[0] - 2 * MARGIN - 70);
    footer.forEach((line, j) =>
      page.drawText(line, {
        x: MARGIN,
        y: MARGIN + 6 - j * 10,
        size: 8,
        font: regular,
        color: MUTED,
      }),
    );
    const label = clean(meta.pageLabel(i + 1, pages.length));
    page.drawText(label, {
      x: A4[0] - MARGIN - regular.widthOfTextAtSize(label, 8),
      y: MARGIN + 6,
      size: 8,
      font: regular,
      color: MUTED,
    });
  });

  return new Uint8Array(await doc.save());
}
