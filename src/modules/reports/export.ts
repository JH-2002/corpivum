import { toCsv } from './csv';
import type { AccountExport, Cell, ExportTable } from './dataset';
import { buildZip, type ZipEntry } from './zip';

/**
 * Arquivos da exportação completa (portabilidade, LEG-D03, ADR-0032): JSON estruturado e versionado, ou um
 * ZIP com um CSV por tabela. Funções puras: os dados chegam já lidos (consentimento + RLS) e decifrados.
 */
export const EXPORT_SCHEMA_VERSION = 1;

export interface FullExportInput {
  generatedAt: Date;
  timeZone: string;
  /** Rodapé fixo (`disclaimer.reportFooter`) com a data. */
  notice: string;
  account: AccountExport;
  tables: readonly ExportTable[];
}

const encoder = new TextEncoder();

function records(t: ExportTable): Record<string, Cell>[] {
  return t.rows.map((row) => Object.fromEntries(t.columns.map((c, i) => [c, row[i] ?? null])));
}

export function fullExportJson(input: FullExportInput): Uint8Array<ArrayBuffer> {
  const doc = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    timeZone: input.timeZone,
    notice: input.notice,
    account: input.account,
    tables: Object.fromEntries(
      input.tables.map((t) => [t.name, { badge: t.badge, units: t.units, records: records(t) }]),
    ),
  };
  return encoder.encode(`${JSON.stringify(doc, null, 2)}\n`);
}

function accountCsvs(a: AccountExport): ZipEntry[] {
  const p = a.preferences;
  const csv = (columns: string[], rows: Cell[][]) => encoder.encode(toCsv(columns, rows));
  return [
    {
      name: 'account.csv',
      data: csv(
        ['field', 'value'],
        [
          ['email', a.email],
          ['createdAt', a.createdAt],
          ['emailVerifiedAt', a.emailVerifiedAt],
          ['mfaEnabled', a.mfaEnabled],
          ['dataMode', a.dataMode],
          ['streaksEnabled', p.streaksEnabled],
          ['calorieEstimateEnabled', p.calorieEstimateEnabled],
          ['remindHabits', p.remindHabits],
          ['remindDailyLog', p.remindDailyLog],
          ['quietStartMin', p.quietStartMin],
          ['quietEndMin', p.quietEndMin],
        ],
      ),
    },
    {
      name: 'consents.csv',
      data: csv(
        ['purpose', 'policyVersion', 'grantedAt', 'revokedAt'],
        a.consents.map((c) => [c.purpose, c.policyVersion, c.grantedAt, c.revokedAt]),
      ),
    },
    {
      name: 'documents.csv',
      data: csv(
        ['document', 'version', 'kind', 'at'],
        a.documents.map((d) => [d.document, d.version, d.kind, d.at]),
      ),
    },
    {
      name: 'privacy_requests.csv',
      data: csv(
        ['kind', 'status', 'createdAt', 'dueAt', 'closedAt'],
        a.privacyRequests.map((r) => [r.kind, r.status, r.createdAt, r.dueAt, r.closedAt]),
      ),
    },
  ];
}

function readme(input: FullExportInput): string {
  const lines = [
    input.notice,
    '',
    `schemaVersion: ${EXPORT_SCHEMA_VERSION}`,
    `generatedAt: ${input.generatedAt.toISOString()}`,
    `timeZone: ${input.timeZone}`,
    'CSV: UTF-8, separador ";", ponto decimal. Datas no formato ISO 8601.',
    '',
    ...input.tables.map((t) => {
      const units = Object.entries(t.units).map(([c, u]) => `${c}=${u}`);
      return `${t.name}.csv (${t.badge})${units.length > 0 ? `: ${units.join(', ')}` : ''}`;
    }),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function fullExportZip(input: FullExportInput): Uint8Array<ArrayBuffer> {
  return buildZip(
    [
      { name: 'README.txt', data: encoder.encode(readme(input)) },
      ...accountCsvs(input.account),
      ...input.tables.map((t) => ({
        name: `${t.name}.csv`,
        data: encoder.encode(toCsv(t.columns, t.rows)),
      })),
    ],
    input.generatedAt,
  );
}
