/**
 * Módulo `twin` (§15–§18, LEG-M05, ADR-0026): funções puras do Health Digital Twin. Medidas vigentes por
 * data, forma do corpo a partir só das medidas informadas (sem peso, sem IMC), comparação Antes × Agora,
 * regiões do corpo.
 * Sem React e sem three.js: o desenho fica em `src/components/twin`.
 */
export {
  BODY_REGIONS,
  COMPARE_FIELDS,
  REGION_FIELD,
  SHAPE_FIELDS,
  type BodyRegion,
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
