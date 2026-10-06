import { constantTimeEqual, hmac } from './crypto';

/**
 * Age gate 18+ (LEG-F01). A data de nascimento só existe durante a requisição: nunca é gravada em banco,
 * log ou cookie. Para adultos, um cookie assinado de curta duração prova que o passo 1 foi cumprido.
 */
export const ADULT_AGE = 18;
export const AGE_GATE_VERSION = 'v1';
export const AGE_OK_TTL_SECONDS = 30 * 60;
export const AGE_OK_COOKIE = 'hm_age_ok';
export const AGE_BLOCK_COOKIE = 'hm_age_block';
const TIME_ZONE = 'America/Sao_Paulo';

/** Data de hoje (ano, mês, dia) no fuso de Brasília. */
export function todayInBrazil(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Idade completa em anos. Nascido em 29/02: completa o ano em 01/03 nos anos não bissextos. */
export function ageOn(birth: { year: number; month: number; day: number }, now: Date): number {
  const today = todayInBrazil(now);
  let age = today.year - birth.year;
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) age -= 1;
  return age;
}

/** Valida uma data ISO (AAAA-MM-DD) real e plausível. Não guarda nada. */
export function parseBirthDate(
  iso: string,
  now: Date,
): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  const today = todayInBrazil(now);
  if (year < today.year - 130) return null;
  const birth = { year, month, day };
  if (ageOn(birth, now) < 0) return null;
  return birth;
}

export function isAdult(birth: { year: number; month: number; day: number }, now: Date): boolean {
  return ageOn(birth, now) >= ADULT_AGE;
}

/** Cookie `hm_age_ok`: `v1.<exp>.<assinatura>`. Sem data de nascimento nem identificador. */
export function signAgeOk(secret: Uint8Array, now: Date): string {
  const exp = Math.floor(now.getTime() / 1000) + AGE_OK_TTL_SECONDS;
  const payload = `${AGE_GATE_VERSION}.${exp}`;
  return `${payload}.${hmac(secret, 'age-ok', payload).toString('base64url')}`;
}

export function verifyAgeOk(secret: Uint8Array, value: string | undefined, now: Date): boolean {
  if (!value) return false;
  const m = /^(v\d+)\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!m) return false;
  const [, version, exp, sig] = m;
  const payload = `${version}.${exp}`;
  const expected = hmac(secret, 'age-ok', payload).toString('base64url');
  const validSig = constantTimeEqual(sig ?? '', expected);
  return validSig && version === AGE_GATE_VERSION && Number(exp) > now.getTime() / 1000;
}
