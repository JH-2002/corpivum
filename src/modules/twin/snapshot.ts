import type { BodyField, BodyRecord } from '@/modules/body';
import { round } from '@/lib/stats';
import { COMPARE_FIELDS } from './regions';

/** Valor informado e o dia do registro de onde veio (`null` = registro anterior ao período). */
export interface MeasureValue {
  value: number;
  day: string | null;
}

/** Medidas vigentes num dia: para cada campo, o último valor informado até esse dia. */
export interface BodySnapshot {
  day: string;
  values: Partial<Record<BodyField, MeasureValue>>;
}

/** Dias com medição no período, em ordem: as posições do controle de datas (§15). */
export function measurementDays(records: readonly BodyRecord[]): string[] {
  return [...new Set(records.map((r) => r.day))].sort();
}

/**
 * Medidas vigentes em `day` (§15). As circunferências costumam ser medidas com menos frequência que o
 * peso, então cada campo usa o último valor informado até o dia, com a data real do registro (que a
 * interface mostra). Altura sem registro no período usa a última informada em qualquer data.
 */
export function bodySnapshotAt(
  records: readonly BodyRecord[],
  day: string,
  fallbackHeightCm: number | null = null,
): BodySnapshot {
  const values: Partial<Record<BodyField, MeasureValue>> = {};
  const sorted = [...records]
    .filter((r) => r.day <= day)
    .sort((a, b) => a.day.localeCompare(b.day));
  for (const r of sorted) {
    for (const field of COMPARE_FIELDS) {
      const v = r[field];
      if (v !== null) values[field] = { value: v, day: r.day };
    }
  }
  if (!values.heightCm && fallbackHeightCm !== null) {
    values.heightCm = { value: fallbackHeightCm, day: null };
  }
  return { day, values };
}

export type Direction = 'up' | 'down' | 'same';

export interface MeasureDiff {
  field: BodyField;
  before: MeasureValue | null;
  after: MeasureValue | null;
  /** `after − before`, arredondado a 0,1; `null` se faltar um dos lados. */
  delta: number | null;
  direction: Direction | null;
}

/**
 * Antes × Agora (§16): diferença de cada medida entre duas datas, em número e direção (a interface
 * mostra seta e texto, nunca só a forma). Direção é só "subiu/desceu/igual", sem juízo.
 */
export function compareSnapshots(before: BodySnapshot, after: BodySnapshot): MeasureDiff[] {
  return COMPARE_FIELDS.map((field) => {
    const a = before.values[field] ?? null;
    const b = after.values[field] ?? null;
    const delta = a && b ? round(b.value - a.value, 1) : null;
    const direction: Direction | null =
      delta === null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
    return { field, before: a, after: b, delta, direction };
  });
}
