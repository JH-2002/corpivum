import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Primitivas de segredo do módulo de auth (ADR-0014).
 * REGRA: nenhum segredo (token, hash, código, assinatura) é comparado com `===`. Use `constantTimeEqual`.
 */

type Bytes = Uint8Array | string;

function toBuffer(value: Bytes): Buffer {
  return typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
}

/**
 * Comparação em tempo constante. Os dois lados passam por SHA-256 antes do `timingSafeEqual`: os tamanhos
 * ficam iguais (o comprimento do segredo não vaza) e a comparação nunca retorna antes do fim.
 */
export function constantTimeEqual(a: Bytes, b: Bytes): boolean {
  const da = createHash('sha256').update(toBuffer(a)).digest();
  const db = createHash('sha256').update(toBuffer(b)).digest();
  return timingSafeEqual(da, db);
}

export function sha256(value: Bytes): Buffer {
  return createHash('sha256').update(toBuffer(value)).digest();
}

/** HMAC-SHA-256 com separação de domínio: chaves de finalidades diferentes nunca colidem. */
export function hmac(secret: Uint8Array, domain: string, value: Bytes): Buffer {
  return createHmac('sha256', secret).update(`${domain}\u0000`).update(toBuffer(value)).digest();
}

/** Token aleatório (CSPRNG) em base64url. Padrão: 32 bytes = 256 bits. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
