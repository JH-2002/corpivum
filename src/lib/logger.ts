/**
 * Logger estruturado que aceita SOMENTE metadados tipados (CLAUDE.md regra 5, LEG-R04).
 * Não há campo livre: conteúdo de saúde, notas, medidas ou mensagens da IA não cabe aqui.
 * Em tempo de execução, só as chaves de `FIELDS` passam, e textos precisam ter formato de identificador.
 * Para adicionar um campo, inclua-o em `LogMeta` e em `FIELDS` e justifique no PR.
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

/** Formatos aceitos por campo, verificados em tempo de execução (o tipo só barra objetos literais). */
const IDENTIFIER = /^[A-Za-z0-9_.:-]{1,64}$/;
const MASKED_EMAIL = /^[^@\s]?\*\*\*@[^@\s]?\*\*\*(\.[a-z0-9-]{1,24})?$/i;
type FieldKind = 'identifier' | 'number' | 'identifierOrNumber' | 'maskedEmail';

const FIELDS: Record<keyof LogMeta, FieldKind> = {
  requestId: 'identifier',
  userId: 'identifier',
  adapter: 'identifier',
  operation: 'identifier',
  durationMs: 'number',
  status: 'identifierOrNumber',
  errorCode: 'identifier',
  model: 'identifier',
  inputTokens: 'number',
  outputTokens: 'number',
  jobName: 'identifier',
  jobId: 'identifier',
  attempt: 'number',
  template: 'identifier',
  recipient: 'maskedEmail',
  count: 'number',
  region: 'identifier',
};

export const REDACTED = '[redacted]';

function sanitizeValue(kind: FieldKind, value: unknown): string | number {
  const isNumber = typeof value === 'number' && Number.isFinite(value);
  const isText = typeof value === 'string';
  switch (kind) {
    case 'number':
      return isNumber ? value : REDACTED;
    case 'identifierOrNumber':
      return isNumber ? value : isText && IDENTIFIER.test(value) ? value : REDACTED;
    case 'identifier':
      return isText && IDENTIFIER.test(value) ? value : REDACTED;
    case 'maskedEmail':
      return isText && MASKED_EMAIL.test(value) ? value : REDACTED;
  }
}

/** Copia só campos da allowlist; valores fora do formato esperado viram `[redacted]` (LEG-R04). */
export function sanitizeMeta(meta: unknown): LogMeta {
  if (typeof meta !== 'object' || meta === null) return {};
  const out: Record<string, string | number> = {};
  for (const [key, kind] of Object.entries(FIELDS) as Array<[keyof LogMeta, FieldKind]>) {
    const value = (meta as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = sanitizeValue(kind, value);
  }
  return out as LogMeta;
}

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
    sink({ ...sanitizeMeta(meta), ts: new Date().toISOString(), level, event: safeEvent });
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
