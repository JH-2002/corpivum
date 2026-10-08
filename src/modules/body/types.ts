export const BODY_FIELDS = [
  'weightKg',
  'heightCm',
  'waistCm',
  'hipCm',
  'armCm',
  'thighCm',
  'chestCm',
  'bodyFatPct',
] as const;
export type BodyField = (typeof BODY_FIELDS)[number];

/** Medição informada (§23). Campos ausentes = não informados naquele registro. */
export type BodyRecord = {
  id: string;
  measuredAt: string;
  day: string;
} & Record<BodyField, number | null>;
