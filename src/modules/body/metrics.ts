import { round } from '@/lib/stats';
import { BODY_FIELDS, type BodyField, type BodyRecord } from './types';

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

/** Linha do gráfico de variação: o dia e, por campo, a diferença desde a primeira medição (`null` sem valor). */
export type ChangeRow = { day: string } & Partial<Record<BodyField, number | null>>;

/**
 * Variação de cada campo desde a sua primeira medição no conjunto (cm ou kg): todas as séries partem de zero, e
 * medidas de tamanhos diferentes (braço e quadril) cabem no mesmo eixo sem que a maior achate as outras.
 */
export function changeRows(
  records: readonly BodyRecord[],
  fields: readonly BodyField[],
): ChangeRow[] {
  const base = new Map<BodyField, number>();
  return records.map((r) => {
    const row: ChangeRow = { day: r.day };
    for (const field of fields) {
      const value = r[field];
      if (value === null) {
        row[field] = null;
        continue;
      }
      if (!base.has(field)) base.set(field, value);
      row[field] = round(value - base.get(field)!, 1);
    }
    return row;
  });
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

export interface HistoryRow {
  record: BodyRecord;
  /** Campos a mostrar nesta data (só os registrados nela, sem repetir o que a tela já mostra). */
  fields: BodyField[];
}

/**
 * Linhas do histórico de medições, da mais recente à mais antiga, sem dado duplicado na tela: cada data mostra só
 * os campos registrados nela; a altura só aparece quando muda; o peso e a altura mais recentes ficam fora, porque
 * já estão nos blocos de estado atual. Linha sem campo continua (dá para editar ou apagar o registro).
 */
export function historyRows(records: readonly BodyRecord[]): HistoryRow[] {
  const lastWith = (field: BodyField) => records.findLast((r) => r[field] !== null)?.id;
  const inTiles: Partial<Record<BodyField, string | undefined>> = {
    weightKg: lastWith('weightKg'),
    heightCm: lastWith('heightCm'),
  };
  let previousHeight: number | null = null;
  const rows = records.map((record) => {
    const fields = BODY_FIELDS.filter((field) => {
      const value = record[field];
      if (value === null) return false;
      if (field === 'heightCm') {
        const unchanged = value === previousHeight;
        previousHeight = value;
        if (unchanged) return false;
      }
      return inTiles[field] !== record.id;
    });
    return { record, fields };
  });
  return rows.reverse();
}
