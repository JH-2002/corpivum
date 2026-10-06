import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AdapterError } from '@/lib/errors';
import type { DataKey, KmsProvider } from './types';

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * KMS local para DESENVOLVIMENTO: a chave mestra vem do ambiente (KMS_LOCAL_MASTER_KEY).
 * Recusado em produção pela validação de env. Formato da DEK cifrada: iv | tag | ciphertext.
 */
export class LocalKmsProvider implements KmsProvider {
  readonly id = 'local';
  readonly #masterKey: Buffer;
  readonly #keyId: string;

  constructor(masterKeyBase64: string, keyId = 'local-v1') {
    const key = Buffer.from(masterKeyBase64, 'base64');
    if (key.length !== KEY_BYTES) throw new AdapterError('kms.local', 'init');
    this.#masterKey = key;
    this.#keyId = keyId;
  }

  async generateDataKey(): Promise<DataKey> {
    const plaintext = randomBytes(KEY_BYTES);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.#masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      plaintext: new Uint8Array(plaintext),
      encrypted: new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), ciphertext])),
      keyId: this.#keyId,
    };
  }

  async decryptDataKey(encrypted: Uint8Array, keyId: string): Promise<Uint8Array> {
    if (keyId !== this.#keyId || encrypted.length !== IV_BYTES + TAG_BYTES + KEY_BYTES) {
      throw new AdapterError('kms.local', 'decrypt');
    }
    const buf = Buffer.from(encrypted);
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.#masterKey, buf.subarray(0, IV_BYTES));
      decipher.setAuthTag(buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      const body = buf.subarray(IV_BYTES + TAG_BYTES);
      return new Uint8Array(Buffer.concat([decipher.update(body), decipher.final()]));
    } catch (cause) {
      throw new AdapterError('kms.local', 'decrypt', { cause });
    }
  }
}
