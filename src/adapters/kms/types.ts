/**
 * Gerenciamento de chaves para criptografia de envelope (LEG-S02).
 * A chave de dados (DEK) cifra o campo com AES-256-GCM; o KMS cifra a DEK com a chave mestra (KEK).
 * O utilitário de criptografia de campo é implementado na Fase 1a sobre esta interface.
 */
export interface DataKey {
  /** DEK em claro: usar e descartar; nunca persistir nem logar. */
  plaintext: Uint8Array;
  /** DEK cifrada pela chave mestra: é o que se persiste junto ao dado. */
  encrypted: Uint8Array;
  /** Identifica a chave mestra usada (permite rotação, ver docs/runbooks/KEY_ROTATION.md). */
  keyId: string;
}

export interface KmsProvider {
  readonly id: string;
  generateDataKey(): Promise<DataKey>;
  decryptDataKey(encrypted: Uint8Array, keyId: string): Promise<Uint8Array>;
}
