import type { Env } from '@/lib/env';
import { AdapterError } from '@/lib/errors';
import { LocalKmsProvider } from './local';
import type { KmsProvider } from './types';

export type * from './types';

export function createKmsProvider(
  env: Pick<Env, 'KMS_PROVIDER' | 'KMS_LOCAL_MASTER_KEY'>,
): KmsProvider {
  switch (env.KMS_PROVIDER) {
    case 'local':
      if (!env.KMS_LOCAL_MASTER_KEY) throw new AdapterError('kms.local', 'init');
      return new LocalKmsProvider(env.KMS_LOCAL_MASTER_KEY);
  }
}
