/**
 * Armazenamento de objetos (exportações, relatórios). Nunca público: sem URLs públicas;
 * download sempre autenticado e com expiração (LEG-D03). Região no Brasil (LEG-S10).
 */
export interface StoredObjectInfo {
  key: string;
  size: number;
  contentType: string;
}

export interface StorageProvider {
  readonly id: string;
  put(key: string, body: Uint8Array, options: { contentType: string }): Promise<StoredObjectInfo>;
  get(key: string): Promise<{ body: Uint8Array; info: StoredObjectInfo }>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Apaga todos os objetos sob o prefixo (ex.: `exports/<userId>`), na eliminação e na exclusão (PR1b-B9). */
  deletePrefix(prefix: string): Promise<void>;
  /**
   * Chaves dos objetos sob o prefixo, em ordem, depois de `startAfter` (se houver), até `limit` (varredura de
   * órfãos, OI-35). Só as chaves: nunca o conteúdo. No provedor real, listagem por prefixo (ex.: ListObjectsV2
   * com `StartAfter`), na mesma região (LEG-S10).
   */
  list(prefix: string, limit: number, startAfter?: string): Promise<string[]>;
}

/** Segmentos alfanuméricos separados por `/`; sem `..`, sem caminho absoluto. */
const STORAGE_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*(\/[a-zA-Z0-9][a-zA-Z0-9_.-]*)*$/;

export function isValidStorageKey(key: string): boolean {
  return key.length <= 512 && STORAGE_KEY_PATTERN.test(key) && !key.split('/').includes('..');
}
