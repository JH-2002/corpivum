import { randomInt } from 'node:crypto';
import { RECOVERY_CODE_COUNT } from './constants';
import { hmac } from './crypto';

/**
 * Códigos de recuperação do MFA (LEG-S04): 10 de uso único, ~49,5 bits cada (10 símbolos de um alfabeto de 31),
 * no formato xxxxx-xxxxx. Guardados só como HMAC-SHA-256 com pepper: com essa entropia, Argon2 não acrescenta
 * proteção e o HMAC permite busca exata pelo hash.
 */
// Sem 0/O/1/I/L para evitar confusão na leitura.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    let raw = '';
    for (let i = 0; i < 10; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

/** Normaliza o que a pessoa digitou: minúsculas, sem espaços nem hífen. */
export function normalizeRecoveryCode(input: string): string {
  return input.toLowerCase().replace(/[\s-]/g, '');
}

export function looksLikeRecoveryCode(input: string): boolean {
  return /^[a-z0-9]{10}$/.test(normalizeRecoveryCode(input));
}

export function hashRecoveryCode(pepper: Uint8Array, code: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(hmac(pepper, 'recovery-code', normalizeRecoveryCode(code)));
}
