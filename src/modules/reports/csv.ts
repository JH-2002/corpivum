import type { Cell } from './dataset';

/**
 * CSV para planilhas em pt-BR (LEG-D03): UTF-8 com BOM, separador `;`, quebra CRLF e aspas no padrão
 * RFC 4180. Texto que começa com `= + - @`, tab ou CR ganha um apóstrofo na frente, para a planilha não o
 * executar como fórmula (injeção de fórmula). Números com ponto decimal, sem formatação local.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: Cell): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const lines = [columns.map(csvCell), ...rows.map((r) => r.map(csvCell))].map((l) => l.join(';'));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
