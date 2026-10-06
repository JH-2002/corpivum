import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { canonicalContext, type KmsProvider } from '@/adapters/kms/types';
import { AdapterError } from '@/lib/errors';

/**
 * Criptografia de campo com envelope (LEG-S02, ADR-0016).
 * Cada escrita gera uma DEK nova pelo KmsProvider; o valor é cifrado com AES-256-GCM e o contexto
 * `{ userId, table, column }` entra como AAD tanto na DEK quanto no dado: decifrar em outra linha,
 * coluna ou usuário falha.
 *
 * Formato: 0x01 | len(keyId) u8 | keyId | len(encDEK) u16be | encDEK | iv(12) | tag(16) | ciphertext
 */
export interface FieldContext {
  userId: string;
  table: string;
  column: string;
}

const VERSION = 0x01;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function toContext(ctx: FieldContext): Record<string, string> {
  return { userId: ctx.userId, table: ctx.table, column: ctx.column };
}

export async function encryptField(
  kms: KmsProvider,
  ctx: FieldContext,
  plaintext: Uint8Array | string,
): Promise<Uint8Array<ArrayBuffer>> {
  const context = toContext(ctx);
  const dataKey = await kms.generateDataKey(context);
  const dek = Buffer.from(dataKey.plaintext);
  try {
    const keyId = Buffer.from(dataKey.keyId, 'utf8');
    const encDek = Buffer.from(dataKey.encrypted);
    if (keyId.length === 0 || keyId.length > 255 || encDek.length > 0xffff) {
      throw new AdapterError('crypto.field', 'encrypt');
    }
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', dek, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(canonicalContext(context));
    const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const encDekLen = Buffer.alloc(2);
    encDekLen.writeUInt16BE(encDek.length);
    const out = Buffer.concat([
      Buffer.from([VERSION, keyId.length]),
      keyId,
      encDekLen,
      encDek,
      iv,
      cipher.getAuthTag(),
      ciphertext,
    ]);
    return new Uint8Array(out);
  } finally {
    dek.fill(0);
    dataKey.plaintext.fill(0);
  }
}

export async function decryptField(
  kms: KmsProvider,
  ctx: FieldContext,
  blob: Uint8Array,
): Promise<Buffer> {
  const buf = Buffer.from(blob);
  let offset = 0;
  const fail = (cause?: unknown) => new AdapterError('crypto.field', 'decrypt', { cause });

  if (buf.length < 2 || buf[0] !== VERSION) throw fail();
  const keyIdLen = buf[1] ?? 0;
  offset = 2;
  if (buf.length < offset + keyIdLen + 2) throw fail();
  const keyId = buf.subarray(offset, offset + keyIdLen).toString('utf8');
  offset += keyIdLen;
  const encDekLen = buf.readUInt16BE(offset);
  offset += 2;
  if (buf.length < offset + encDekLen + IV_BYTES + TAG_BYTES) throw fail();
  const encDek = buf.subarray(offset, offset + encDekLen);
  offset += encDekLen;
  const iv = buf.subarray(offset, offset + IV_BYTES);
  offset += IV_BYTES;
  const tag = buf.subarray(offset, offset + TAG_BYTES);
  offset += TAG_BYTES;
  const ciphertext = buf.subarray(offset);

  const context = toContext(ctx);
  const dekBytes = await kms.decryptDataKey(new Uint8Array(encDek), keyId, context);
  const dek = Buffer.from(dekBytes);
  try {
    const decipher = createDecipheriv('aes-256-gcm', dek, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(canonicalContext(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (cause) {
    throw fail(cause);
  } finally {
    dek.fill(0);
    dekBytes.fill(0);
  }
}
