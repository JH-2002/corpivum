/** Estatística descritiva simples sobre registros. Funções puras. */

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Desvio-padrão populacional; `null` com menos de 2 valores. */
export function stdDev(values: readonly number[]): number | null {
  const m = mean(values);
  if (m === null || values.length < 2) return null;
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length);
}

export function round(value: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Diferença entre dois valores opcionais (atual − anterior), ou `null`. */
export function delta(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : current - previous;
}
