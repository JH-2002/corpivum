import type { BodyField } from '@/modules/body';
import type { BodyModel } from './bodyModel';
import type { TwinRow } from './snapshot';

type Profile = Readonly<Partial<Record<BodyField, number>>>;

/**
 * Medidas fictícias de cada variante no último dia do demo (ADR-0028), para o demo mostrar cada modelo com
 * proporções coerentes (feminino: cintura/quadril ~0,7). SÓ no demo: com dados da pessoa, a variante nunca
 * muda medida nenhuma (é só aparência).
 */
export const DEMO_TWIN_PROFILES: Readonly<Record<BodyModel, Profile>> = Object.freeze({
  feminine: {
    heightCm: 163,
    weightKg: 60,
    chestCm: 90,
    armCm: 27,
    waistCm: 70,
    hipCm: 98,
    thighCm: 57,
  },
  // Medidas do antigo perfil neutro, com traços masculinos no modelo.
  masculine: {
    heightCm: 170,
    weightKg: 68,
    chestCm: 92,
    armCm: 28.5,
    waistCm: 77,
    hipCm: 96,
    thighCm: 55,
  },
});

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Série fictícia do demo deslocada para terminar nas medidas do perfil da variante. As datas e as variações
 * entre os dias (o que o Antes × Agora mostra) ficam iguais; só o nível muda. Roda no navegador: a variante
 * escolhida não vai ao servidor.
 */
export function demoTwinRows(
  rows: readonly TwinRow[],
  latestHeightCm: number | null,
  model: BodyModel,
): { rows: TwinRow[]; latestHeightCm: number | null } {
  const profile = DEMO_TWIN_PROFILES[model];
  const fields = Object.keys(profile) as BodyField[];
  const last: Partial<Record<BodyField, number>> = {};
  for (const row of [...rows].sort((a, b) => a.day.localeCompare(b.day))) {
    for (const field of fields) {
      const value = row[field];
      if (typeof value === 'number') last[field] = value;
    }
  }
  if (last.heightCm === undefined && latestHeightCm !== null) last.heightCm = latestHeightCm;

  const offset: Partial<Record<BodyField, number>> = {};
  for (const field of fields) {
    const from = last[field];
    const to = profile[field];
    if (from !== undefined && to !== undefined) offset[field] = to - from;
  }
  const shift = (field: BodyField, value: number) => round1(value + (offset[field] ?? 0));

  return {
    rows: rows.map((row) => {
      const out: TwinRow = { ...row };
      for (const field of fields) {
        const value = row[field];
        if (typeof value === 'number') out[field] = shift(field, value);
      }
      return out;
    }),
    latestHeightCm: latestHeightCm === null ? null : shift('heightCm', latestHeightCm),
  };
}
