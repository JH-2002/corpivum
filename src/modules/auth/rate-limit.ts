import type { Db } from '@/lib/db/client';
import { hmac } from './crypto';

/**
 * Limites de tentativa (LEG-S04, LEG-S05). Janela fixa no Postgres via `app.rate_limit_hit`.
 * A chave é HMAC com pepper: IP e e-mail nunca são gravados em claro.
 */
export const RATE_LIMITS = {
  loginAccount: { windowSeconds: 15 * 60, max: 5 },
  loginIp: { windowSeconds: 15 * 60, max: 20 },
  registerIp: { windowSeconds: 60 * 60, max: 5 },
  resetIp: { windowSeconds: 60 * 60, max: 5 },
  resetAccount: { windowSeconds: 60 * 60, max: 3 },
  resendIp: { windowSeconds: 60 * 60, max: 5 },
  /** Tentativas de 2º fator por CONTA (somadas entre sessões pendentes): barra força bruta do TOTP. */
  mfaAccount: { windowSeconds: 60 * 60, max: 10 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/** Tentativas de MFA por sessão pendente; ao exceder, a sessão é revogada. */
export const MFA_MAX_ATTEMPTS = 5;

export async function rateLimitHit(
  db: Db,
  secret: Uint8Array,
  name: RateLimitName,
  subject: string,
  now: Date,
): Promise<boolean> {
  const { windowSeconds, max } = RATE_LIMITS[name];
  const key = hmac(secret, 'rate-limit', `${name}:${subject}`);
  const rows = await db.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT allowed FROM app.rate_limit_hit(${key}, ${windowSeconds}::int, ${max}::int, ${now}::timestamptz)`;
  return rows[0]?.allowed === true;
}
