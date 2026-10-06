/**
 * Logger estruturado que aceita SOMENTE metadados tipados (CLAUDE.md regra 5, LEG-R04).
 * Não há campo livre: conteúdo de saúde, diário, medicamentos ou mensagens da IA não cabe aqui.
 * Para adicionar um campo, inclua-o em `LogMeta` e justifique no PR.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogMeta {
  requestId?: string;
  userId?: string;
  adapter?: string;
  operation?: string;
  durationMs?: number;
  status?: number | string;
  errorCode?: string;
  /** Metadados de IA permitidos por LEG-I08. */
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Identificadores técnicos, nunca conteúdo. */
  jobName?: string;
  jobId?: string;
  attempt?: number;
  template?: string;
  recipient?: string;
  count?: number;
  region?: string;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
/** Nome do evento: `dominio.acao`, só minúsculas, dígitos, `_` e `.`. */
const EVENT_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

export interface LogRecord extends LogMeta {
  ts: string;
  level: LogLevel;
  event: string;
}

export type LogSink = (record: LogRecord) => void;

const stdoutSink: LogSink = (record) => {
  const line = JSON.stringify(record);
  // eslint-disable-next-line no-console -- único ponto autorizado de saída de log
  (record.level === 'error' || record.level === 'warn' ? console.error : console.log)(line);
};

export interface Logger {
  debug(event: string, meta?: LogMeta): void;
  info(event: string, meta?: LogMeta): void;
  warn(event: string, meta?: LogMeta): void;
  error(event: string, meta?: LogMeta): void;
}

export function createLogger(options: { minLevel?: LogLevel; sink?: LogSink } = {}): Logger {
  const minLevel = options.minLevel ?? 'info';
  const sink = options.sink ?? stdoutSink;

  const write = (level: LogLevel, event: string, meta: LogMeta = {}) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const safeEvent = EVENT_PATTERN.test(event) ? event : 'log.invalid_event_name';
    sink({ ...meta, ts: new Date().toISOString(), level, event: safeEvent });
  };

  return {
    debug: (event, meta) => write('debug', event, meta),
    info: (event, meta) => write('info', event, meta),
    warn: (event, meta) => write('warn', event, meta),
    error: (event, meta) => write('error', event, meta),
  };
}

/** Mascara e-mail para log: `m***@d***.com`. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local.slice(0, 1)}***@${host.slice(0, 1)}***${tld}`;
}

export const logger = createLogger({
  minLevel: process.env.NODE_ENV === 'test' ? 'error' : 'info',
});
