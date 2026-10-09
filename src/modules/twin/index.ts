/**
 * Módulo `twin` (§15–§18, LEG-M05, ADR-0026): funções puras do Health Digital Twin. Medidas vigentes por
 * data, forma do corpo a partir só das medidas informadas (sem peso, sem IMC), comparação Antes × Agora,
 * regiões do corpo e do cérebro educacional e nível de confiança pela suficiência dos registros.
 * Sem React e sem three.js: o desenho fica em `src/components/twin`.
 */
export { brainConfidence, TWIN_RULES, type Confidence } from './confidence';
export {
  BODY_REGIONS,
  BRAIN_REGION_THEMES,
  BRAIN_REGIONS,
  BRAIN_THEMES,
  brainLobeAt,
  COMPARE_FIELDS,
  REGION_FIELD,
  SHAPE_FIELDS,
  type BodyRegion,
  type BrainRegion,
  type BrainTheme,
} from './regions';
export { bodyShape, TORSO_DEPTH_RATIO, type BodyShape } from './shape';
export {
  bodySnapshotAt,
  compareSnapshots,
  firstMeasure,
  measurementDays,
  toTwinRows,
  type BodySnapshot,
  type Direction,
  type MeasureDiff,
  type MeasureValue,
  type TwinRow,
} from './snapshot';
