/** Prazo máximo de uma apresentação em curso (ADR-0035, revisão M1). */
export const PRESENTING_MAX_AGE_MS = 4 * 60 * 60 * 1000;

/** `on.<epoch ms>` ainda no prazo; qualquer outro valor (antigo, adulterado, vencido) não vale. */
export function presentingValid(value: string | undefined, now: number = Date.now()): boolean {
  const match = /^on\.(\d{1,15})$/.exec(value ?? '');
  if (!match) return false;
  const expires = Number(match[1]);
  return expires > now && expires <= now + PRESENTING_MAX_AGE_MS;
}
