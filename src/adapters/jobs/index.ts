import type { Env } from '@/lib/env';
import { MemoryJobQueue } from './memory';
import type { JobQueue } from './types';

export type * from './types';

export function createJobQueue(env: Pick<Env, 'JOB_QUEUE'>): JobQueue {
  switch (env.JOB_QUEUE) {
    case 'memory':
      return new MemoryJobQueue();
  }
}
