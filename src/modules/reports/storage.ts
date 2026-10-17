import type { StorageProvider } from '@/adapters/storage/types';

/**
 * Onde ficam os arquivos de exportação e relatório (ADR-0032). Chave derivada de pessoa + pedido: sem
 * coluna no banco e com prefixo por pessoa, para a eliminação e a exclusão apagarem tudo de uma vez
 * (PR1b-B9). O conteúdo vai cifrado (envelope, contexto `EXPORT_FILE_FIELD`), nunca em storage público.
 */
export const EXPORT_FILE_FIELD = { table: 'data_export_jobs', column: 'file' } as const;

export const EXPORTS_ROOT = 'exports';
export const exportPrefix = (userId: string) => `${EXPORTS_ROOT}/${userId}`;
export const exportKey = (userId: string, jobId: string) =>
  `${EXPORTS_ROOT}/${userId}/${jobId}.bin`;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const EXPORT_KEY = new RegExp(`^${EXPORTS_ROOT}/(${UUID})/(${UUID})\\.bin$`);

/** Pessoa e pedido de uma chave `exports/<pessoa>/<pedido>.bin`; `null` fora do formato (OI-35). */
export function parseExportKey(key: string): { userId: string; jobId: string } | null {
  const m = EXPORT_KEY.exec(key);
  return m?.[1] && m[2] ? { userId: m[1], jobId: m[2] } : null;
}

export function eraseUserExports(storage: StorageProvider, userId: string): Promise<void> {
  return storage.deletePrefix(exportPrefix(userId));
}
