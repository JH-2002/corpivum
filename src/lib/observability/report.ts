import 'server-only';
import { getAdapters } from '@/adapters';
import type { ErrorReporter } from '@/adapters/error-reporter/types';
import { logger as defaultLogger, type Logger } from '@/lib/logger';
import { buildRequestErrorReport } from './error-report';

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
    const reporter = (deps.reporter ?? (() => getAdapters().errorReporter))();
    await reporter.captureError(report);
  } catch {
    logger.error('error.report_failed');
  }
}
