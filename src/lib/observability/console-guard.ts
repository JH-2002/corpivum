import { REDACTED, sanitizeLogLine } from '@/lib/logger';
import { sanitizeError } from './error-report';

/**
 * Guarda do `console.error`/`console.warn` em produção (PR1a-B5, LEG-R04, ADR-0038). O `onRequestError` não
 * impede o Next de imprimir o erro original (mensagem e pilha) nem uma dependência de imprimir argumentos. Com
 * a guarda, só passa: linha do nosso logger (filtrada de novo), erro reduzido a nome, código, `digest` e
 * quadros, números e booleanos. Qualquer outro texto ou objeto vira `[redacted]`.
 */
export function guardConsoleArgs(args: readonly unknown[]): unknown[] {
  return args.map((arg) => {
    if (typeof arg === 'number' || typeof arg === 'boolean') return arg;
    if (typeof arg === 'string') return sanitizeLogLine(arg) ?? REDACTED;
    if (arg instanceof Error || (typeof arg === 'object' && arg !== null && 'stack' in arg)) {
      return JSON.stringify({ error: sanitizeError(arg) });
    }
    return REDACTED;
  });
}

const INSTALLED = Symbol.for('healthmind.consoleGuard');
type Guarded = Console & { [INSTALLED]?: true };

/** Substitui `error` e `warn` do console (uma vez por processo). */
export function installConsoleGuard(target: Console = console): void {
  const guarded = target as Guarded;
  if (guarded[INSTALLED]) return;
  guarded[INSTALLED] = true;
  for (const method of ['error', 'warn'] as const) {
    const original = target[method].bind(target);
    target[method] = (...args: unknown[]) => original(...guardConsoleArgs(args));
  }
}
