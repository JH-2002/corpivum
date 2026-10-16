import type { Alert, ErrorReporter, RequestErrorReport } from './types';

const LIMIT = 50;

/** Fake para testes (recusado em produção por `parseEnv`): guarda os últimos 50 relatórios e alertas. */
export class MemoryErrorReporter implements ErrorReporter {
  readonly id = 'memory';
  readonly errors: RequestErrorReport[] = [];
  readonly alerts: Alert[] = [];

  async captureError(report: RequestErrorReport): Promise<void> {
    this.errors.push(report);
    if (this.errors.length > LIMIT) this.errors.shift();
  }

  async captureAlert(alert: Alert): Promise<void> {
    this.alerts.push(alert);
    if (this.alerts.length > LIMIT) this.alerts.shift();
  }
}
