/**
 * Módulo `twin` (§15–§18, LEG-M05, ADR-0026): funções puras do Health Digital Twin. Medidas vigentes por
 * data, forma do corpo a partir só das medidas informadas (sem peso, sem IMC), comparação Antes × Agora,
 * regiões do corpo, influências dos morph targets do modelo `.glb` e preferência de modelo (ADR-0028).
 * Sem React e sem three.js: o desenho fica em `src/components/twin`.
 */
export {
  BODY_MODEL_STORAGE_KEY,
  BODY_MODELS,
  DEMO_BODY_MODEL,
  DEMO_BODY_MODEL_STORAGE_KEY,
  parseBodyModel,
  type BodyAsset,
  type BodyModel,
  type MeasurePlane,
} from './bodyModel';
export { canAutoload3D, type DeviceSignals } from './autoload';
export { DEMO_TWIN_PROFILES, demoTwinRows } from './demoProfiles';
export {
  bodyMorphWeights,
  drawnGirthsCm,
  drawnTolerance,
  modelGirthCm,
  MORPH_LIMITS,
  MORPH_NAMES,
  outOfDrawingRange,
  type BodyCalibration,
  type BodyMorph,
  type MorphName,
} from './morph';
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
