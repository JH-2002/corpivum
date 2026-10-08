import type { KmsProvider } from '@/adapters/kms/types';
import { decryptField, encryptField } from '@/lib/crypto/field';
import type { Tx } from '@/lib/db';

/**
 * Núcleo compartilhado dos módulos de saúde (ADR-0021).
 *
 * - `HealthRunner`: executa `fn` numa transação com `app.user_id` E consentimento `health_data` ativo
 *   (guard da aplicação). As políticas RLS repetem a checagem no banco (dupla barreira, LEG-C04).
 *   No Next: `withConsent(userId, 'health_data', fn)`; nos testes: `withConsentOn(db, ...)`.
 * - `FieldCipher`: texto livre sempre cifrado em nível de campo (LEG-S02, ADR-0016), com o contexto
 *   `{ userId, table, column }` como AAD. Nunca pesquisável no banco.
 */
export type HealthRunner = <T>(userId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;

export interface FieldRef {
  table: string;
  column: string;
}

export interface FieldCipher {
  seal(userId: string, field: FieldRef, text: string): Promise<Uint8Array<ArrayBuffer>>;
  open(userId: string, field: FieldRef, blob: Uint8Array): Promise<string>;
}

export function createFieldCipher(kms: KmsProvider): FieldCipher {
  return {
    seal: (userId, field, text) => encryptField(kms, { userId, ...field }, text),
    open: async (userId, field, blob) =>
      (await decryptField(kms, { userId, ...field }, blob)).toString('utf8'),
  };
}

export interface HealthDeps {
  run: HealthRunner;
  cipher: FieldCipher;
  timeZone: string;
  now?: () => Date;
}
