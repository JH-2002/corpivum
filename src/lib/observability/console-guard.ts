import { REDACTED, sanitizeLogLine } from '@/lib/logger';
import { sanitizeError } from './error-report';

/**
 * Guarda do console em produção (PR1a-B5, LEG-R04, ADR-0038; todos os métodos de saída desde a 7e, 7c-R3). O
 * `onRequestError` não impede o Next de imprimir o erro original (mensagem e pilha) nem uma dependência (Next,
 * Prisma, pg) de imprimir argumentos por `console.log`/`info`. Com a guarda, só passa: linha do nosso logger
 * (filtrada de novo), erro reduzido a nome, código, `digest` e quadros, números e booleanos. Qualquer outro
 * texto ou objeto vira `[redacted]` (inclusive as linhas de subida do Next, que não fazem falta no log).
 * Escrita direta em `process.stdout`/`stderr` por dependência fica fora (residual em OPEN_ISSUES 7c-R3).
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

/** Métodos do console que imprimem argumentos. */
export const GUARDED_CONSOLE_METHODS = [
  'error',
  'warn',
  'log',
  'info',
  'debug',
  'trace',
  'dir',
  'table',
] as const;

/** Substitui os métodos de saída do console (uma vez por processo). */
export function installConsoleGuard(target: Console = console): void {
  const guarded = target as Guarded;
  if (guarded[INSTALLED]) return;
  guarded[INSTALLED] = true;
  for (const method of GUARDED_CONSOLE_METHODS) {
    const fn = target[method] as ((...args: unknown[]) => void) | undefined;
    if (typeof fn !== 'function') continue;
    const original = fn.bind(target);
    (target as unknown as Record<string, unknown>)[method] = (...args: unknown[]) =>
      original(...guardConsoleArgs(args));
  }
}
