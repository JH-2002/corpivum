/**
 * Logger estruturado que aceita SOMENTE metadados tipados (CLAUDE.md regra 5, LEG-R04).
 * Não há campo livre: conteúdo de saúde, notas, alimentação ou medidas não cabe aqui.
 * Em tempo de execução, só as chaves de `FIELDS` passam, e textos precisam ter formato de identificador.
 * Para adicionar um campo, inclua-o em `LogMeta` e em `FIELDS` e justifique no PR. Revisão do esquema na 7c
 * (ADR-0038): saíram os campos sem uso (`durationMs`, `status`, `region`), `requestId` virou `privacyRequestId`
 * (era o id do pedido do titular, não da requisição) e entraram só os campos do `ErrorReporter` e dos alertas.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogMeta {
  /** Id técnico da conta (UUID), nunca e-mail ou nome. */
  userId?: string;
  /** Id do pedido do titular (`privacy_requests.id`), não da requisição HTTP. */
  privacyRequestId?: string;
  adapter?: string;
  operation?: string;
  errorCode?: string;
  /** Identificadores técnicos, nunca conteúdo. */
  jobName?: string;
  jobId?: string;
  attempt?: number;
  template?: string;
  recipient?: string;
  count?: number;
  /** Alertas (7c): o teto que a contagem passou. */
  threshold?: number;
  /** Relatório de erro (7c, `ErrorReporter`): id do relatório, nunca da pessoa. */
  reportId?: string;
  /** Nome da classe do erro (ex.: `PrismaClientKnownRequestError`), nunca a mensagem. */
  errorName?: string;
  /** `digest` do Next: correlaciona com a página de erro sem expor o erro. */
  digest?: string;
  /** Rota como arquivo (`/(app)/corpo/[id]/page`), nunca o caminho pedido nem a query. */
  route?: string;
  routeType?: string;
  method?: string;
  /** Quadro do topo da pilha como `arquivo:linha:coluna`, sem pasta. */
  frame?: string;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
/** Nome do evento: `dominio.acao`, só minúsculas, dígitos, `_` e `.`. */
const EVENT_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

/** Formatos aceitos por campo, verificados em tempo de execução (o tipo só barra objetos literais). */
const IDENTIFIER = /^[A-Za-z0-9_.:-]{1,64}$/;
const MASKED_EMAIL = /^[^@\s]?\*\*\*@[^@\s]?\*\*\*(\.[a-z0-9-]{1,24})?$/i;
/** Rota do App Router como arquivo: segmentos, grupos `(x)` e dinâmicos `[x]`; sem query nem valores. */
export const ROUTE_TEMPLATE = /^\/[A-Za-z0-9_\-[\]().@/]{0,160}$/;
/** Quadro da pilha: só o nome do arquivo (sem pasta, que pode ter o nome de quem roda) e a posição. */
export const STACK_FRAME = /^[A-Za-z0-9_.\-[\]]{1,120}:\d{1,7}:\d{1,7}$/;
type FieldKind = 'identifier' | 'number' | 'maskedEmail' | 'route' | 'frame';

const FIELDS: Record<keyof LogMeta, FieldKind> = {
  userId: 'identifier',
  privacyRequestId: 'identifier',
  adapter: 'identifier',
  operation: 'identifier',
  errorCode: 'identifier',
  jobName: 'identifier',
  jobId: 'identifier',
  attempt: 'number',
  template: 'identifier',
  recipient: 'maskedEmail',
  count: 'number',
  threshold: 'number',
  reportId: 'identifier',
  errorName: 'identifier',
  digest: 'identifier',
  route: 'route',
  routeType: 'identifier',
  method: 'identifier',
  frame: 'frame',
};

export const REDACTED = '[redacted]';

function sanitizeValue(kind: FieldKind, value: unknown): string | number {
  const isNumber = typeof value === 'number' && Number.isFinite(value);
  const isText = typeof value === 'string';
  switch (kind) {
    case 'number':
      return isNumber ? value : REDACTED;
    case 'identifier':
      return isText && IDENTIFIER.test(value) ? value : REDACTED;
    case 'maskedEmail':
      return isText && MASKED_EMAIL.test(value) ? value : REDACTED;
    case 'route':
      return isText && ROUTE_TEMPLATE.test(value) ? value : REDACTED;
    case 'frame':
      return isText && STACK_FRAME.test(value) ? value : REDACTED;
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

const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Reconhece uma linha JSON do próprio logger e a devolve filtrada de novo; qualquer outro texto devolve
 * `undefined`. Usado pela guarda do console em produção (ADR-0038), que só deixa passar linhas de log.
 */
export function sanitizeLogLine(line: string): string | undefined {
  if (!line.startsWith('{')) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const { ts, level, event } = parsed as Record<string, unknown>;
  if (
    typeof level !== 'string' ||
    !Object.hasOwn(LEVEL_ORDER, level) ||
    typeof event !== 'string'
  ) {
    return undefined;
  }
  return JSON.stringify({
    ...sanitizeMeta(parsed),
    ts: typeof ts === 'string' && ISO_TS.test(ts) ? ts : new Date().toISOString(),
    level,
    event: EVENT_PATTERN.test(event) ? event : 'log.invalid_event_name',
  });
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
