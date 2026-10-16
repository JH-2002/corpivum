import { getDb, getWorkerDb } from '@/lib/db/client';
import type { Env } from '@/lib/env';
import { MemoryJobQueue } from './memory';
import { PgJobQueue } from './postgres';
import type { JobQueue } from './types';

export type * from './types';

/**
 * A fila em memória (dev/test) é uma só por processo. No build do Next, a instrumentação (que registra os
 * handlers e consome a fila) e as server actions (que enfileiram) ficam em bundles diferentes, cada um com
 * o próprio cache de módulos: sem o `globalThis`, cada lado teria a sua fila e o job pedido numa action
 * nunca rodaria. A fila Postgres não precisa disso (o estado está no banco).
 */
const MEMORY_QUEUE = Symbol.for('healthmind.memoryJobQueue');
type WithQueue = typeof globalThis & { [MEMORY_QUEUE]?: MemoryJobQueue };

export function createJobQueue(env: Pick<Env, 'JOB_QUEUE'>): JobQueue {
  switch (env.JOB_QUEUE) {
    case 'memory': {
      const g = globalThis as WithQueue;
      g[MEMORY_QUEUE] ??= new MemoryJobQueue();
      return g[MEMORY_QUEUE];
    }
    case 'postgres':
      return new PgJobQueue(getDb(), { workerDb: getWorkerDb });
  }
}
