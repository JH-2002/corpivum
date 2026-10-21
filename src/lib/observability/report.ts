import 'server-only';
import { getAdapters } from '@/adapters';
import { ConsoleErrorReporter } from '@/adapters/error-reporter/console';
import type { ErrorReporter } from '@/adapters/error-reporter/types';
import { isDemoOnly } from '@/lib/demo-mode';
import { logger as defaultLogger, type Logger } from '@/lib/logger';
import { buildRequestErrorReport } from './error-report';

/**
 * No modo só demo não há adaptadores (ADR-0043): o relatório, já filtrado pela lista de campos, vai só ao log
 * estruturado, que fica com a hospedagem (D8).
 */
function defaultReporter(): ErrorReporter {
  return isDemoOnly() ? new ConsoleErrorReporter() : getAdapters().errorReporter;
}

/**
 * Chamado pelo `onRequestError` (src/instrumentation.ts). Monta o relatório por lista de permissão ANTES de
 * qualquer adaptador tocar no erro e nunca lança: falha ao relatar vira só `error.report_failed`.
 */
export async function reportRequestError(
  error: unknown,
  request: unknown,
  context: unknown,
  deps: { reporter?: () => ErrorReporter; logger?: Logger } = {},
): Promise<void> {
  const logger = deps.logger ?? defaultLogger;
  try {
    const report = buildRequestErrorReport(error, request, context);
    const reporter = (deps.reporter ?? defaultReporter)();
    await reporter.captureError(report);
  } catch {
    logger.error('error.report_failed');
  }
}
