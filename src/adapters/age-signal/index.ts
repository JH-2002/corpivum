import type { Env } from '@/lib/env';
import { NoAgeSignalProvider } from './none';
import type { AgeSignalProvider } from './types';

export type * from './types';

export function createAgeSignalProvider(env: Pick<Env, 'AGE_SIGNAL_PROVIDER'>): AgeSignalProvider {
  switch (env.AGE_SIGNAL_PROVIDER) {
    case 'none':
      return new NoAgeSignalProvider();
  }
}
