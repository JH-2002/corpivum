import type { Env } from '@/lib/env';
import { ConsoleErrorReporter } from './console';
import { MemoryErrorReporter } from './memory';
import type { ErrorReporter } from './types';

export type * from './types';

/**
 * `console`: relatório filtrado no log estruturado (vale também em produção, como o próprio logger).
 * `memory`: só testes. O fornecedor externo entra depois do checklist (OI-03, OI-11, ADR-0038).
 */
export function createErrorReporter(env: Pick<Env, 'ERROR_REPORTER'>): ErrorReporter {
  switch (env.ERROR_REPORTER) {
    case 'console':
      return new ConsoleErrorReporter();
    case 'memory':
      return new MemoryErrorReporter();
  }
}
