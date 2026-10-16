import { getDb, getWorkerDb } from '@/lib/db/client';
import type { Env } from '@/lib/env';
import type { JobErrorSink } from '@/lib/observability/error-report';
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

/** `onError`: erros dos handlers vão ao `ErrorReporter` pela lista de campos permitidos (7c-R3, ADR-0039). */
export function createJobQueue(
  env: Pick<Env, 'JOB_QUEUE'>,
  options: { onError?: JobErrorSink } = {},
): JobQueue {
  switch (env.JOB_QUEUE) {
    case 'memory': {
      const g = globalThis as WithQueue;
      g[MEMORY_QUEUE] ??= new MemoryJobQueue(undefined, options);
      return g[MEMORY_QUEUE];
    }
    case 'postgres':
      return new PgJobQueue(getDb(), { workerDb: getWorkerDb, onError: options.onError });
  }
}
