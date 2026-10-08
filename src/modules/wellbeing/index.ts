/**
 * Módulo `wellbeing` (§14, LEG-D08, ADR-0021): Índice de Bem-Estar versionado e explicável e resumo do
 * dashboard por regras. Funções puras. Fórmulas documentadas em docs/WELLBEING_SCORE.md.
 */
export {
  computeWellbeingScore,
  SCORE_COMPONENTS,
  SCORE_V1,
  SCORE_VERSION,
  type ExclusionReason,
  type ScoreComponent,
  type ScoreComponentId,
  type ScoreInput,
  type WellbeingScore,
} from './score';
export {
  buildSummary,
  SUMMARY_RULES,
  type PeriodRecords,
  type Summary,
  type SummaryKey,
} from './summary';
