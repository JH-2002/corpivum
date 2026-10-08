import { z } from 'zod';

/** Zod para formulários dos módulos de saúde. Sem dependência de servidor. */
// ---------- Zod para formulários (FormData manda '' em campos vazios) ----------

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v;

/** Inteiro opcional numa faixa. */
export function optionalInt(min: number, max: number) {
  return z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).optional());
}

/** Inteiro obrigatório numa faixa. */
export function requiredInt(min: number, max: number) {
  return z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max));
}

/** Decimal opcional numa faixa (aceita vírgula decimal, pt-BR). */
export function optionalDecimal(min: number, max: number) {
  return z.preprocess((v) => {
    const e = emptyToUndefined(v);
    return typeof e === 'string' ? e.replace(',', '.') : e;
  }, z.coerce.number().min(min).max(max).optional());
}

/** Texto livre opcional (vai cifrado). */
export function optionalText(max: number) {
  return z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v.trim()) : undefined),
    z.string().max(max).optional(),
  );
}

/**
 * `YYYY-MM-DDTHH:MM` de um `<input type="datetime-local">`, com data e hora reais (31/02 ou 25:70 são
 * recusados em vez de virar outra data em silêncio).
 */
export const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .refine((v) => {
    const [date, time] = v.split('T') as [string, string];
    const [h, m] = time.split(':').map(Number) as [number, number];
    return h < 24 && m < 60 && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  });
export const isoDateSchema = z.iso.date();
export const idSchema = z.uuid();

/** Lista de valores de um enum fechado (checkbox múltiplo), sem repetição. */
export function enumList<const T extends readonly [string, ...string[]]>(values: T, max: number) {
  return z
    .array(z.enum(values))
    .max(max)
    .transform((list) => [...new Set(list)]);
}

/** Tolerância para relógio adiantado do aparelho ao validar "não no futuro". */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
