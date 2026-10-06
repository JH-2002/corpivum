import type { Env } from '@/lib/env';
import { LocalStorageProvider } from './local';
import type { StorageProvider } from './types';

export type * from './types';
export { isValidStorageKey } from './types';

export function createStorageProvider(
  env: Pick<Env, 'STORAGE_PROVIDER' | 'STORAGE_LOCAL_DIR'>,
): StorageProvider {
  switch (env.STORAGE_PROVIDER) {
    case 'local':
      return new LocalStorageProvider(env.STORAGE_LOCAL_DIR);
  }
}
