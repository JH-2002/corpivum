import { logger as defaultLogger, type Logger } from '@/lib/logger';
import type { Alert, ErrorReport, ErrorReporter } from './types';

/**
 * Implementação local: grava o relatório no log estruturado (que de novo filtra por lista de campos, LEG-R04).
 * Do log vai só o quadro do topo da pilha; a pilha inteira fica para o fornecedor (OI-03).
 */
export class ConsoleErrorReporter implements ErrorReporter {
  readonly id = 'console';
  readonly #logger: Logger;

  constructor({ logger = defaultLogger }: { logger?: Logger } = {}) {
    this.#logger = logger;
  }

  async captureError(report: ErrorReport): Promise<void> {
    if (report.source === 'job') {
      this.#logger.error('error.job', {
        reportId: report.id,
        errorName: report.error.name,
        errorCode: report.error.code,
        frame: report.error.frames[0],
        adapter: report.job.adapter,
        jobName: report.job.name,
        jobId: report.job.id,
        attempt: report.job.attempt,
      });
      return;
    }
    this.#logger.error('error.request', {
      reportId: report.id,
      errorName: report.error.name,
      errorCode: report.error.code,
      digest: report.error.digest,
      frame: report.error.frames[0],
      route: report.request.route,
      routeType: report.request.routeType,
      method: report.request.method,
    });
  }

  async captureAlert(alert: Alert): Promise<void> {
    this.#logger.warn(alert.name.replace(/^security\./, 'alert.'), {
      count: alert.count,
      threshold: alert.threshold,
    });
  }
}
