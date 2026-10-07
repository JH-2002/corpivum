import { constantTimeEqual, hmac, randomToken } from './crypto';
import { normalizeEmail } from './email';

/**
 * Cookie de aparelho conhecido (OI-15, ADR-0019; padrão OWASP "device cookie").
 *
 * Problema: o bloqueio de login por conta (5 tentativas em 15 min) deixava qualquer pessoa travar o acesso de
 * outra só sabendo o e-mail. Solução: depois de um login completo, o navegador recebe um cookie assinado
 * ligado ao e-mail. Tentativas vindas de um aparelho conhecido contam num limite próprio daquele aparelho;
 * o limite por conta só alcança aparelhos desconhecidos. Quem tenta travar a conta trava só os outros.
 *
 * Anti-enumeração: a verificação é só HMAC (sem banco) e o cookie vale para o e-mail digitado, exista a
 * conta ou não. Formato: `v1.<nonce>.<assinatura>`, sem userId e sem e-mail em claro.
 * Girar SESSION_SECRET invalida os cookies (docs/runbooks/KEY_ROTATION.md).
 */
export const KNOWN_DEVICE_COOKIE = '__Host-hm_device';
export const KNOWN_DEVICE_MAX_AGE_S = 180 * 24 * 60 * 60;
const VERSION = 'v1';
const DOMAIN = 'known-device';

function signature(secret: Uint8Array, email: string, nonce: string): string {
  return hmac(secret, DOMAIN, `${VERSION}:${normalizeEmail(email)}:${nonce}`).toString('base64url');
}

/** Emite um cookie novo (nonce novo) para o e-mail da conta que acabou de entrar. */
export function signKnownDevice(secret: Uint8Array, email: string): string {
  const nonce = randomToken(16);
  return `${VERSION}.${nonce}.${signature(secret, email, nonce)}`;
}

/** Devolve o nonce do aparelho se o cookie for válido para este e-mail; senão, null. */
export function verifyKnownDevice(
  secret: Uint8Array,
  value: string | undefined,
  email: string,
): string | null {
  if (!value) return null;
  const m = /^v1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!m) return null;
  const [, nonce = '', sig = ''] = m;
  return constantTimeEqual(sig, signature(secret, email, nonce)) ? nonce : null;
}
