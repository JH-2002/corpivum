import { createHmac, randomBytes } from 'node:crypto';
import { constantTimeEqual } from './crypto';

/**
 * TOTP (RFC 6238 sobre HOTP, RFC 4226): SHA-1, 6 dígitos, passo de 30 s, janela ±1 passo.
 * Implementado com node:crypto, sem dependência (ADR-0014). Anti-reuso: o chamador grava o passo aceito e
 * recusa passos <= ao último usado.
 */
export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;
const SECRET_BYTES = 20;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('base32 inválido');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): Buffer {
  return randomBytes(SECRET_BYTES);
}

export function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(msg).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const bin =
    (((mac[offset] ?? 0) & 0x7f) << 24) |
    ((mac[offset + 1] ?? 0) << 16) |
    ((mac[offset + 2] ?? 0) << 8) |
    (mac[offset + 3] ?? 0);
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD);
}

export function totpAt(secret: Uint8Array, nowMs: number, digits = TOTP_DIGITS): string {
  return hotp(secret, totpStep(nowMs), digits);
}

/**
 * Verifica o código e devolve o passo aceito, ou null. Todos os passos da janela são SEMPRE calculados e
 * comparados em tempo constante, sem retorno antecipado.
 */
export function verifyTotp(secret: Uint8Array, code: string, nowMs: number): number | null {
  const normalized = code.replace(/\s/g, '');
  const wellFormed = /^\d{6}$/.test(normalized);
  const current = totpStep(nowMs);
  let matched: number | null = null;
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const step = current + delta;
    const ok = constantTimeEqual(hotp(secret, step), wellFormed ? normalized : '------');
    // Mantém o maior passo que bateu, sem sair do laço.
    if (ok && (matched === null || step > matched)) matched = step;
  }
  return wellFormed ? matched : null;
}

/** URI de configuração para apps autenticadores. `label` é genérico: o e-mail não entra no QR. */
export function otpauthUri(secret: Uint8Array, label: string, issuer: string): string {
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?${params}`;
}

/** Chave manual em grupos de 4 para leitura (alternativa acessível ao QR). */
export function formatManualKey(secret: Uint8Array): string {
  return base32Encode(secret)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}
