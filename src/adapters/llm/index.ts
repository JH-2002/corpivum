import type { Env } from '@/lib/env';
import { FakeLlmProvider } from './fake';
import type { LlmProvider } from './types';

export type * from './types';

export function createLlmProvider(env: Pick<Env, 'LLM_PROVIDER'>): LlmProvider {
  switch (env.LLM_PROVIDER) {
    case 'fake':
      return new FakeLlmProvider();
  }
}
