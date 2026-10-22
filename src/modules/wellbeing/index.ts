/**
 * Módulo `wellbeing` (§14, LEG-D08, ADR-0021): Índice de Bem-Estar versionado e explicável. O resumo do
 * dashboard por regras fica em `@/modules/insights` (ADR-0025). Funções puras. Fórmulas documentadas em docs/WELLBEING_SCORE.md.
 */
export {
  computeWellbeingScore,
  SCORE_COMPONENTS,
  SCORE_V2,
  SCORE_V3,
  SCORE_VERSION,
  type ExclusionReason,
  type ScoreComponent,
  type ScoreComponentId,
  type ScoreInput,
  type WellbeingScore,
} from './score';
