import { round } from '@/lib/stats';
import type { BodyField, BodyRecord } from './types';

/**
 * Métricas de corpo (§23), funções puras. IMC é ESTIMADO (cálculo direto) e exibido com texto neutro,
 * sem classificação clínica nem meta (LEG-M04).
 */

/** Último valor informado de um campo no conjunto (registros em ordem crescente de data). */
export function latest(
  records: BodyRecord[],
  field: BodyField,
): { value: number; day: string } | null {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const r = records[i];
    const v = r?.[field];
    if (r && v !== null && v !== undefined) return { value: v, day: r.day };
  }
  return null;
}

/** Primeiro valor informado de um campo. */
export function earliest(
  records: BodyRecord[],
  field: BodyField,
): { value: number; day: string } | null {
  for (const r of records) {
    const v = r[field];
    if (v !== null) return { value: v, day: r.day };
  }
  return null;
}

/** Variação do campo dentro do conjunto (último − primeiro), ou `null` com menos de 2 valores. */
export function change(records: BodyRecord[], field: BodyField): number | null {
  const values = records.filter((r) => r[field] !== null);
  if (values.length < 2) return null;
  const first = earliest(records, field);
  const last = latest(records, field);
  return first && last ? round(last.value - first.value, 1) : null;
}

/** IMC = peso / altura² (ESTIMADO). */
export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return round(weightKg / (m * m), 1);
}

/** Série de um campo para gráfico (só dias com valor). */
export function series(
  records: BodyRecord[],
  field: BodyField,
): Array<{ day: string; value: number }> {
  return records.flatMap((r) => {
    const v = r[field];
    return v === null ? [] : [{ day: r.day, value: v }];
  });
}
