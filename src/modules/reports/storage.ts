import type { StorageProvider } from '@/adapters/storage/types';

/**
 * Onde ficam os arquivos de exportação e relatório (ADR-0032). Chave derivada de pessoa + pedido: sem
 * coluna no banco e com prefixo por pessoa, para a eliminação e a exclusão apagarem tudo de uma vez
 * (PR1b-B9). O conteúdo vai cifrado (envelope, contexto `EXPORT_FILE_FIELD`), nunca em storage público.
 */
export const EXPORT_FILE_FIELD = { table: 'data_export_jobs', column: 'file' } as const;

export const exportPrefix = (userId: string) => `exports/${userId}`;
export const exportKey = (userId: string, jobId: string) => `exports/${userId}/${jobId}.bin`;

export function eraseUserExports(storage: StorageProvider, userId: string): Promise<void> {
  return storage.deletePrefix(exportPrefix(userId));
}
