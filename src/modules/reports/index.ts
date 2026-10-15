/**
 * Módulo `reports` (§29, LEG-D03, ADR-0032): relatórios semanal/mensal/anual e exportação completa
 * (portabilidade) em PDF, CSV e JSON. API pública sem dependência de servidor; serviço e job em `./server`.
 */
export { toCsv, csvCell } from './csv';
export {
  EXPORT_TABLES,
  exportTables,
  tableCounts,
  type AccountExport,
  type Cell,
  type ExportTable,
  type ExportTableName,
  type HealthRecords,
} from './dataset';
export {
  EXPORT_SCHEMA_VERSION,
  fullExportJson,
  fullExportZip,
  type FullExportInput,
} from './export';
export { INTERNAL_ONLY_VALUES, mentionsInternalValue } from './internal';
export {
  calendarRange,
  isValidReference,
  previousCalendarRange,
  REPORT_PERIODS,
  reportPeriodSchema,
  type ReportPeriod,
} from './period';
export {
  buildReport,
  bucketPoints,
  WEEKLY_AFTER_DAYS,
  type ChartId,
  type ReportChart,
  type ReportGoal,
  type ReportModel,
  type ReportPoint,
} from './report';
export { buildZip, crc32, readZip, type ZipEntry } from './zip';
