import type { Env } from '@/lib/env';
import { DisabledWearableProvider } from './disabled';
import type { WearableProvider } from './types';

export type * from './types';

export function createWearableProvider(env: Pick<Env, 'WEARABLE_PROVIDER'>): WearableProvider {
  switch (env.WEARABLE_PROVIDER) {
    case 'disabled':
      return new DisabledWearableProvider();
  }
}
