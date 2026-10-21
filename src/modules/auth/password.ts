import { argon2, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { PRODUCT_SLUG } from '@/config/product';
import { PASSWORD_MAX, PASSWORD_MIN } from './constants';
import { constantTimeEqual } from './crypto';

/**
 * Hash de senha com Argon2id nativo do Node 24 (ADR-0014). Parâmetros mínimos recomendados pela OWASP:
 * m=19 MiB, t=2, p=1. Formato PHC: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash> (base64 sem padding).
 */
const argon2Async = promisify(argon2);

const PARAMS = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 } as const;
const SALT_BYTES = 16;

const b64 = (buf: Uint8Array) => Buffer.from(buf).toString('base64').replace(/=+$/, '');

async function derive(
  password: string,
  salt: Uint8Array,
  p: { memory: number; passes: number; parallelism: number; tagLength: number },
): Promise<Buffer> {
  return argon2Async('argon2id', { message: password.normalize('NFKC'), nonce: salt, ...p });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, PARAMS);
  return `$argon2id$v=19$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}$${b64(salt)}$${b64(key)}`;
}

const PHC =
  /^\$argon2id\$v=19\$m=(\d{4,7}),t=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9+/]{16,})\$([A-Za-z0-9+/]{32,})$/;

/** Verifica a senha. Comparação do hash derivado em tempo constante. Formato inválido => false. */
export async function verifyPassword(password: string, phc: string): Promise<boolean> {
  const m = PHC.exec(phc);
  if (!m) return false;
  const [, memory, passes, parallelism, salt, hash] = m;
  const expected = Buffer.from(hash ?? '', 'base64');
  const key = await derive(password, Buffer.from(salt ?? '', 'base64'), {
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
    tagLength: expected.length,
  });
  return constantTimeEqual(key, expected);
}

/** Hash fixo, calculado uma vez, para igualar o tempo quando a conta não existe (anti-enumeração). */
let dummyHash: Promise<string> | undefined;
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(24).toString('base64'));
  await verifyPassword(password, await dummyHash);
  return false;
}

/** Senhas comuns recusadas (lista local curta; sem consulta externa, que seria subprocessador). */
const COMMON = new Set(
  [
    '123456789012',
    '1234567890123',
    'qwertyuiopas',
    'senha1234567',
    'senhasenha12',
    'password1234',
    'passwordpassword',
    'iloveyou1234',
    'brasil123456',
    'healthmind360',
    'healthmind123',
    `${PRODUCT_SLUG}1234`,
    `${PRODUCT_SLUG}2026`,
    `${PRODUCT_SLUG}123456`,
    'aaaaaaaaaaaa',
    'abcdefghijkl',
    'abc123abc123',
    'qwerty123456',
    'mudar1234567',
    'trocar123456',
    'admin1234567',
  ].map((s) => s.toLowerCase()),
);

export type PasswordProblem = 'too_short' | 'too_long' | 'too_common';

export function checkPasswordPolicy(password: string, email?: string): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return 'too_short';
  if (length > PASSWORD_MAX) return 'too_long';
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return 'too_common';
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return 'too_common';
  return null;
}
