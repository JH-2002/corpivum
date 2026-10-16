import { constantTimeEqual, hmac, randomToken, sha256 } from './crypto';
import { normalizeEmail } from './email';

/**
 * Cookie de aparelho conhecido (OI-15, ADR-0019; padrão OWASP "device cookie").
 *
 * Problema: o bloqueio de login por conta (5 tentativas em 15 min) deixava qualquer pessoa travar o acesso de
 * outra só sabendo o e-mail. Solução: depois de um login completo, o navegador recebe um cookie assinado
 * ligado ao e-mail. Tentativas vindas de um aparelho conhecido contam num limite próprio daquele aparelho;
 * o limite por conta só alcança aparelhos desconhecidos. Quem tenta travar a conta trava só os outros.
 *
 * O HMAC também cobre a impressão (SHA-256) do hash de senha atual da conta: trocar ou redefinir a senha (ou
 * apagar a conta) invalida todos os cookies de aparelho, inclusive de aparelhos perdidos (revisão B4). Só a
 * impressão: o pedido de redefinição recebe do banco a impressão, nunca o hash (PR1b-R2-B3, ADR-0037).
 *
 * Anti-enumeração: só um login completo emite o cookie, e a resposta de login é a mesma com ou sem conta.
 * Formato: `v2.<nonce>.<assinatura>`, sem userId, sem e-mail e sem hash em claro. Cookies `v1` (assinados
 * sobre o hash) deixam de valer: a pessoa volta a contar no limite da conta até o próximo login.
 * Girar SESSION_SECRET invalida os cookies (docs/runbooks/KEY_ROTATION.md).
 */
export const KNOWN_DEVICE_COOKIE = '__Host-hm_device';
export const KNOWN_DEVICE_MAX_AGE_S = 180 * 24 * 60 * 60;
const VERSION = 'v2';
const DOMAIN = 'known-device';
/** Impressão fixa para conta inexistente: o HMAC é calculado do mesmo jeito (PR1b-R2-B2). */
const NO_ACCOUNT = new Uint8Array(32);

/** Impressão do hash de senha: igual a `sha256(convert_to(password_hash, 'UTF8'))` de `app.auth_find_reset`. */
export function passwordFingerprint(passwordHash: string): Uint8Array {
  return sha256(passwordHash);
}

function signature(
  secret: Uint8Array,
  email: string,
  fingerprint: Uint8Array,
  nonce: string,
): string {
  return hmac(
    secret,
    DOMAIN,
    `${VERSION}:${normalizeEmail(email)}:${Buffer.from(fingerprint).toString('base64url')}:${nonce}`,
  ).toString('base64url');
}

/** Emite um cookie novo (nonce novo) para a conta que acabou de entrar. */
export function signKnownDevice(
  secret: Uint8Array,
  email: string,
  fingerprint: Uint8Array,
): string {
  const nonce = randomToken(16);
  return `${VERSION}.${nonce}.${signature(secret, email, fingerprint, nonce)}`;
}

/**
 * Devolve o nonce do aparelho se o cookie for válido para este e-mail e esta senha; senão, null.
 * `fingerprint` null (conta inexistente) nunca valida, mas calcula o HMAC do mesmo jeito: o tempo não
 * depende de a conta existir (PR1b-R2-B2).
 */
export function verifyKnownDevice(
  secret: Uint8Array,
  value: string | undefined,
  email: string,
  fingerprint: Uint8Array | null,
): string | null {
  if (!value) return null;
  const m = /^v2\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!m) return null;
  const [, nonce = '', sig = ''] = m;
  const ok = constantTimeEqual(sig, signature(secret, email, fingerprint ?? NO_ACCOUNT, nonce));
  return ok && fingerprint !== null ? nonce : null;
}
