const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
/** Margem antes da virada da hora: os testes avançam o relógio em no máximo ~16 min. */
const SAFE_UNTIL_MINUTE = 40;

/**
 * Relógio inicial dos testes de integração (OPEN_ISSUES PR1a-R3-B5).
 * Os limites de tentativa usam janelas fixas alinhadas à hora cheia. Se o relógio do teste começar perto da
 * virada, um avanço no meio do teste cai na janela seguinte e zera a contagem (falha intermitente na CI).
 * Aqui o relógio fica entre 1 e 40 min depois da hora cheia. Ele só ADIANTA, nunca atrasa: sessões e tokens
 * calculados a partir dele não vencem antes da hora frente ao `now()` do banco.
 */
export function stableTestClock(real: Date = new Date()): Date {
  const intoHour = real.getTime() % HOUR_MS;
  if (intoHour >= MINUTE_MS && intoHour < SAFE_UNTIL_MINUTE * MINUTE_MS) return new Date(real);
  const nextHourStart = real.getTime() - intoHour + (intoHour < MINUTE_MS ? 0 : HOUR_MS);
  return new Date(nextHourStart + MINUTE_MS);
}
