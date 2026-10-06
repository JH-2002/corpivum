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
  /** Reautenticação (senha atual) em ações da conta, por usuário. */
  reauthUser: { windowSeconds: 15 * 60, max: 10 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/** Tentativas de MFA por sessão pendente; ao exceder, a sessão é revogada. */
export const MFA_MAX_ATTEMPTS = 5;

export interface RateLimitResult {
  allowed: boolean;
  /** Tentativas na janela atual, contando esta. */
  hits: number;
  /** Esta tentativa foi a primeira acima do limite (o bloqueio começou agora). */
  justLocked: boolean;
}

export async function rateLimitHit(
  db: Db,
  secret: Uint8Array,
  name: RateLimitName,
  subject: string,
  now: Date,
): Promise<RateLimitResult> {
  const { windowSeconds, max } = RATE_LIMITS[name];
  const key = hmac(secret, 'rate-limit', `${name}:${subject}`);
  const rows = await db.$queryRaw<Array<{ allowed: boolean; hits: number }>>`
    SELECT allowed, hits FROM app.rate_limit_hit(${key}, ${windowSeconds}::int, ${max}::int, ${now}::timestamptz)`;
  const hits = rows[0]?.hits ?? max + 1;
  return { allowed: rows[0]?.allowed === true, hits, justLocked: hits === max + 1 };
}
