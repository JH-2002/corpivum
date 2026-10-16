import type {
  ErrorReporter,
  JobErrorReport,
  RequestErrorReport,
  RouteType,
  SanitizedError,
} from '@/adapters/error-reporter/types';
import { ROUTE_TEMPLATE, STACK_FRAME, type Logger } from '@/lib/logger';

/**
 * Monta o relatório de erro por LISTA DE CAMPOS PERMITIDOS (LEG-R04, ADR-0038). Do erro saem só nome, código,
 * `digest`, nome e código da causa e quadros da pilha; da requisição, só o método e a rota como arquivo.
 * Nunca entram: mensagem, propriedades extras do erro, `request.path` (traz query e valores dos segmentos),
 * cabeçalhos (cookies, autorização, IP), corpo, argumentos de server action. Cada campo passa por um formato
 * fechado; o que não casa vira `Unknown`/`unknown` ou some. Sem dependência de Node: roda em qualquer runtime.
 */
const ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
/** `AppError`, Node (`ECONNREFUSED`), Prisma (`P2002`) ou SQLSTATE (`23505`, `42P01`). */
const ERROR_CODE = /^(?:[A-Z][A-Z0-9_]{1,63}|[0-9A-Z]{5})$/;
/** Hash numérico do Next ou constante (`DYNAMIC_SERVER_USAGE`); o `NEXT_REDIRECT;...` (traz URL) não passa. */
const DIGEST = /^(?:\d{1,20}|[A-Z][A-Z_]{1,40})$/;
const MAX_FRAMES = 10;
const FRAME_LINE = /^at (?:.*? \()?(.+?):(\d+):(\d+)\)?$/;

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const ROUTE_TYPES = new Set<RouteType>(['render', 'route', 'action', 'proxy']);
const ROUTER_KINDS = new Set(['App Router', 'Pages Router'] as const);
const RENDER_SOURCES = new Set([
  'react-server-components',
  'react-server-components-payload',
  'server-rendering',
]);
const REVALIDATE_REASONS = new Set(['on-demand', 'stale'] as const);
const RENDER_TYPES = new Set(['dynamic', 'dynamic-resume'] as const);

function matching(pattern: RegExp, value: unknown): string | undefined {
  return typeof value === 'string' && pattern.test(value) ? value : undefined;
}

function oneOf<T extends string>(allowed: ReadonlySet<T>, value: unknown): T | undefined {
  return typeof value === 'string' && allowed.has(value as T) ? (value as T) : undefined;
}

/** Lê uma propriedade sem deixar getter ou Proxy derrubar o relatório. */
function read(target: unknown, key: string): unknown {
  if (typeof target !== 'object' || target === null) return undefined;
  try {
    return (target as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/** Quadros `arquivo:linha:coluna`, ignorando a primeira linha (nome + mensagem, que pode ter várias linhas). */
function stackFrames(error: unknown): string[] {
  const stack = read(error, 'stack');
  if (typeof stack !== 'string') return [];
  const message = read(error, 'message');
  // A mensagem pode ter quebras de linha que imitam quadros: tudo até o fim dela fica de fora. Se ela mudou depois
  // de a pilha ser montada (não está mais na pilha), não dá para separar a original: nenhum quadro sai.
  let start = 0;
  if (typeof message === 'string' && message.length > 0) {
    if (!stack.includes(message)) return [];
    start = stack.indexOf(message) + message.length;
  }
  const frames: string[] = [];
  for (const raw of stack.slice(start).split('\n')) {
    const m = FRAME_LINE.exec(raw.trim());
    if (!m) continue;
    const file = (m[1] ?? '').replace(/^file:\/\//, '');
    const base = file.slice(Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')) + 1);
    const frame = `${base}:${m[2]}:${m[3]}`;
    if (STACK_FRAME.test(frame)) frames.push(frame);
    if (frames.length >= MAX_FRAMES) break;
  }
  return frames;
}

export function sanitizeError(error: unknown): SanitizedError {
  const out: SanitizedError = {
    name: matching(ERROR_NAME, read(error, 'name')) ?? 'Unknown',
    frames: stackFrames(error),
  };
  const code = matching(ERROR_CODE, read(error, 'code'));
  if (code) out.code = code;
  const digest = matching(DIGEST, read(error, 'digest'));
  if (digest) out.digest = digest;
  const cause = read(error, 'cause');
  if (typeof cause === 'object' && cause !== null) {
    const causeCode = matching(ERROR_CODE, read(cause, 'code'));
    out.cause = {
      name: matching(ERROR_NAME, read(cause, 'name')) ?? 'Unknown',
      ...(causeCode ? { code: causeCode } : {}),
    };
  }
  return out;
}

/**
 * Relatório de um erro capturado pelo `onRequestError` do Next. `request` só fornece o método; `path` e
 * `headers` nunca são lidos.
 */
export function buildRequestErrorReport(
  error: unknown,
  request: unknown,
  context: unknown,
  options: { now?: Date; id?: string } = {},
): RequestErrorReport {
  const method = read(request, 'method');
  const upper = typeof method === 'string' ? method.toUpperCase() : '';
  const report: RequestErrorReport = {
    id: options.id ?? crypto.randomUUID(),
    occurredAt: (options.now ?? new Date()).toISOString(),
    source: 'request',
    error: sanitizeError(error),
    request: {
      method: METHODS.has(upper) ? upper : 'OTHER',
      route: matching(ROUTE_TEMPLATE, read(context, 'routePath')) ?? 'unknown',
      routeType: oneOf(ROUTE_TYPES, read(context, 'routeType')) ?? 'unknown',
    },
  };
  const routerKind = oneOf(ROUTER_KINDS, read(context, 'routerKind'));
  if (routerKind) report.request.routerKind = routerKind;
  const renderSource = oneOf(RENDER_SOURCES, read(context, 'renderSource'));
  if (renderSource) report.request.renderSource = renderSource;
  const revalidateReason = oneOf(REVALIDATE_REASONS, read(context, 'revalidateReason'));
  if (revalidateReason) report.request.revalidateReason = revalidateReason;
  const renderType = oneOf(RENDER_TYPES, read(context, 'renderType'));
  if (renderType) report.request.renderType = renderType;
  return report;
}

/** Nome do job como registrado (`privacy.account_purge`); id técnico; adaptador da fila. */
const JOB_NAME = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
const JOB_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const ADAPTER = /^[a-z][a-z0-9_-]{0,31}$/;

export interface FailedJob {
  name: unknown;
  id: unknown;
  attempt: unknown;
  adapter: unknown;
}

/**
 * Relatório de um erro de job (7c-R3, ADR-0039): mesma lista de campos permitidos do `onRequestError`. O payload
 * do job nunca é lido; nome, id, tentativa e adaptador passam por formato fechado.
 */
export function buildJobErrorReport(
  error: unknown,
  job: FailedJob,
  options: { now?: Date; id?: string } = {},
): JobErrorReport {
  const attempt = job.attempt;
  return {
    id: options.id ?? crypto.randomUUID(),
    occurredAt: (options.now ?? new Date()).toISOString(),
    source: 'job',
    error: sanitizeError(error),
    job: {
      name: matching(JOB_NAME, job.name) ?? 'unknown',
      id: matching(JOB_ID, job.id) ?? 'unknown',
      attempt:
        typeof attempt === 'number' && Number.isInteger(attempt) && attempt >= 0 ? attempt : -1,
      adapter: matching(ADAPTER, job.adapter) ?? 'unknown',
    },
  };
}

/** Quem a fila chama quando um job falha. Nunca lança. */
export type JobErrorSink = (error: unknown, job: FailedJob) => Promise<void>;

/**
 * Liga as filas ao `ErrorReporter` (7c-R3): o relatório é montado ANTES de o adaptador tocar no erro, e a falha ao
 * relatar vira só `error.report_failed`, como no `onRequestError`.
 */
export function createJobErrorSink(reporter: () => ErrorReporter, logger: Logger): JobErrorSink {
  return async (error, job) => {
    try {
      await reporter().captureError(buildJobErrorReport(error, job));
    } catch {
      logger.error('error.report_failed');
    }
  };
}

/** Tempo máximo que a fila espera o relatório de erro (o fornecedor externo pode estar lento ou fora do ar). */
export const JOB_ERROR_REPORT_TIMEOUT_MS = 3000;

/**
 * Chamado pelas filas DEPOIS de registrar a falha do job (revisão da 7d, B2): o relatório nunca segura o job no
 * lock nem pula o `jobs_fail`, mesmo com um sink que lance ou trave. Espera no máximo `timeoutMs`.
 */
export async function notifyJobError(
  sink: JobErrorSink | undefined,
  error: unknown,
  job: FailedJob,
  timeoutMs = JOB_ERROR_REPORT_TIMEOUT_MS,
): Promise<void> {
  if (!sink) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      sink(error, job),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    // O sink padrão já registra `error.report_failed`; um sink que lance não pode derrubar a fila.
  } finally {
    clearTimeout(timer);
  }
}
