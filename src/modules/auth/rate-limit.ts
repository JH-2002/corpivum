import type { Db } from '@/lib/db/client';
import { hmac } from './crypto';

/**
 * Limites de tentativa (LEG-S04, LEG-S05). Janela fixa no Postgres via `app.rate_limit_hit`.
 * A chave é HMAC com pepper: IP e e-mail nunca são gravados em claro.
 */
export const RATE_LIMITS = {
  loginAccount: { windowSeconds: 15 * 60, max: 5 },
  loginIp: { windowSeconds: 15 * 60, max: 20 },
  /** Por aparelho conhecido (cookie assinado, OI-15): o titular não é bloqueado pelo limite da conta. */
  loginDevice: { windowSeconds: 15 * 60, max: 5 },
  registerIp: { windowSeconds: 60 * 60, max: 5 },
  resetIp: { windowSeconds: 60 * 60, max: 5 },
  /** Por caixa de destino canônica (PR1a-R3-M1). */
  resetAccount: { windowSeconds: 60 * 60, max: 3 },
  resetDevice: { windowSeconds: 60 * 60, max: 3 },
  resendIp: { windowSeconds: 60 * 60, max: 5 },
  /**
   * E-mails de cadastro ("já existe uma conta") e de verificação por destinatário: evita assédio. A chave
   * é a caixa canônica (`canonicalMailbox`, PR1a-R3-M1): `x+1@` e, no Gmail, `x.y@` contam juntos.
   */
  registerAccount: { windowSeconds: 60 * 60, max: 3 },
  resendAccount: { windowSeconds: 60 * 60, max: 3 },
  /**
   * Teto diário por destinatário, somado entre cadastro e reenvio (PR1a-R3-B1): os baldes de 1 h sozinhos
   * deixavam ~144 e-mails por dia. A redefinição fica de fora (revisão M3 da 7b): senão um terceiro gastaria o
   * teto e deixaria o titular 24 h sem o link (OI-15); ela segue com o limite de 3 por hora.
   */
  mailRecipientDay: { windowSeconds: 24 * 60 * 60, max: 10 },
  /**
   * FALHAS de 2º fator por CONTA (somadas entre sessões pendentes): barra força bruta do TOTP. Conta só
   * falhas (PR1a-R2-B2): entrar certo várias vezes não bloqueia.
   */
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

/**
 * Tentativas já contadas na janela atual, sem contar esta (`app.rate_limit_peek`). Para limites que contam só
 * falhas (`mfaAccount`, PR1a-R2-B2): consulta antes, registra com `rateLimitHit` só quando a tentativa falha.
 */
export async function rateLimitPeek(
  db: Db,
  secret: Uint8Array,
  name: RateLimitName,
  subject: string,
  now: Date,
): Promise<number> {
  const { windowSeconds } = RATE_LIMITS[name];
  const key = hmac(secret, 'rate-limit', `${name}:${subject}`);
  const rows = await db.$queryRaw<Array<{ hits: number }>>`
    SELECT app.rate_limit_peek(${key}, ${windowSeconds}::int, ${now}::timestamptz) AS hits`;
  return rows[0]?.hits ?? Number.MAX_SAFE_INTEGER;
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
