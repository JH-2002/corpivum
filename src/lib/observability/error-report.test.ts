// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ConsoleErrorReporter } from '@/adapters/error-reporter/console';
import { MemoryErrorReporter } from '@/adapters/error-reporter/memory';
import { MemoryJobQueue } from '@/adapters/jobs/memory';
import { AdapterError, NotFoundError } from '@/lib/errors';
import { createLogger, type LogRecord } from '@/lib/logger';
import { guardConsoleArgs, installConsoleGuard } from './console-guard';
import {
  buildJobErrorReport,
  buildRequestErrorReport,
  createJobErrorSink,
  notifyJobError,
  sanitizeError,
} from './error-report';
import { reportRequestError } from './report';

/**
 * LEG-R04, ADR-0038: medidas, notas, alimentação, e-mail, token e cookie injetados em todo lugar onde um erro ou
 * uma requisição pode carregá-los; nada disso pode sair no relatório, no log nem no console. Dados sintéticos.
 */
const SECRETS = [
  '82,5 kg',
  'cintura 94 cm',
  'dormi mal e chorei',
  'comi só uma maçã',
  'maria.silva@exemplo.test',
  'tok_9f8e7d6c5b4a',
  'hm_session',
  'peso=82',
  'notas_dormi_mal',
  '11999998888',
];

function poisonedError(): Error {
  const error = new Error(
    'Falha ao salvar medida 82,5 kg (cintura 94 cm) de maria.silva@exemplo.test: dormi mal e chorei\n' +
      '    at notas_dormi_mal (/srv/app/notas_dormi_mal.js:1:1)',
    {
      cause: Object.assign(new Error('comi só uma maçã; token tok_9f8e7d6c5b4a'), {
        code: 'P2002',
        meta: { target: ['email'], value: 'maria.silva@exemplo.test' },
      }),
    },
  );
  return Object.assign(error, {
    code: 'ERR 82,5 kg',
    digest: 'NEXT_REDIRECT;replace;/corpo?peso=82;307;',
    body: { weightKg: 82.5, note: 'dormi mal e chorei' },
    args: ['maria.silva@exemplo.test', '11999998888'],
    meta: { sql: "INSERT INTO body_measurements VALUES ('82,5 kg')" },
  });
}

const request = {
  path: '/corpo/123?peso=82&nota=dormi%20mal%20e%20chorei',
  method: 'post',
  headers: {
    cookie: 'hm_session=tok_9f8e7d6c5b4a',
    authorization: 'Bearer tok_9f8e7d6c5b4a',
    'x-forwarded-for': '203.0.113.7',
    referer: 'http://localhost:3000/corpo?peso=82',
  },
  body: 'note=dormi mal e chorei&weight=82,5 kg',
};
const context = {
  routerKind: 'App Router',
  routePath: '/(app)/corpo/[id]/page',
  routeType: 'action',
  renderSource: 'react-server-components',
  revalidateReason: undefined,
  renderType: 'dynamic',
};

function expectClean(output: unknown) {
  const text = typeof output === 'string' ? output : JSON.stringify(output);
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

describe('buildRequestErrorReport (lista de permissão)', () => {
  it('não leva medidas, notas, e-mail, token, cookie nem query', () => {
    const report = buildRequestErrorReport(poisonedError(), request, context, {
      id: 'r-1',
      now: new Date('2026-10-16T12:00:00.000Z'),
    });
    expectClean(report);
    expect(report).toEqual({
      id: 'r-1',
      occurredAt: '2026-10-16T12:00:00.000Z',
      source: 'request',
      error: {
        name: 'Error',
        cause: { name: 'Error', code: 'P2002' },
        frames: expect.any(Array),
      },
      request: {
        method: 'POST',
        route: '/(app)/corpo/[id]/page',
        routeType: 'action',
        routerKind: 'App Router',
        renderSource: 'react-server-components',
        renderType: 'dynamic',
      },
    });
    // O quadro falso escrito na mensagem não entra; os verdadeiros vêm deste arquivo de teste.
    expect(report.error.frames.length).toBeGreaterThan(0);
    for (const frame of report.error.frames) expect(frame).toMatch(/^[\w.\-[\]]+:\d+:\d+$/);
  });

  it('mensagem trocada depois da pilha: nenhum quadro sai (as linhas originais podiam imitar quadros)', () => {
    const err = new Error('peso 82,5 kg\n    at notas_dormi_mal (/srv/notas_dormi_mal.js:1:1)');
    // O V8 formata a pilha no primeiro acesso: lida antes da troca, ela fica com a mensagem original.
    expect(err.stack).toContain('notas_dormi_mal');
    err.message = `prefixo: ${err.message}`;
    expect(sanitizeError(err).frames).toEqual([]);
    expectClean(sanitizeError(err));
  });

  it('só as chaves da lista aparecem, em qualquer nível', () => {
    const report = buildRequestErrorReport(poisonedError(), request, context);
    expect(Object.keys(report).sort()).toEqual(['error', 'id', 'occurredAt', 'request', 'source']);
    expect(Object.keys(report.error).sort()).toEqual(['cause', 'frames', 'name']);
    expect(Object.keys(report.request).sort()).toEqual(
      ['method', 'renderSource', 'renderType', 'route', 'routeType', 'routerKind'].sort(),
    );
  });

  it('mantém códigos técnicos e o digest numérico do Next', () => {
    const err = Object.assign(new AdapterError('kms', 'decrypt'), { digest: '1234567890' });
    expect(sanitizeError(err)).toMatchObject({
      name: 'AdapterError',
      code: 'ADAPTER_FAILURE',
      digest: '1234567890',
    });
    expect(sanitizeError(Object.assign(new Error('x'), { code: '42501' })).code).toBe('42501');
    expect(sanitizeError(new NotFoundError('medida 82,5 kg')).code).toBe('NOT_FOUND');
  });

  it('nome com conteúdo, rota com valores e método estranho caem no padrão', () => {
    const err = Object.assign(new Error('x'), { name: 'dormi mal e chorei' });
    const report = buildRequestErrorReport(
      err,
      { method: 'dormi mal' },
      { routePath: '/corpo?peso=82', routeType: 'qualquer' },
    );
    expect(report.error.name).toBe('Unknown');
    expect(report.request).toEqual({ method: 'OTHER', route: 'unknown', routeType: 'unknown' });
    expectClean(report);
  });

  it('valores que não são Error, getters que lançam e Proxy não derrubam o relatório', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('dormi mal e chorei');
        },
      },
    );
    const withGetter = Object.defineProperty(new Error('x'), 'code', {
      get() {
        throw new Error('82,5 kg');
      },
    });
    for (const value of ['82,5 kg', 42, null, undefined, { note: 'dormi mal e chorei' }, hostile]) {
      const report = buildRequestErrorReport(value, hostile, hostile);
      expect(report.error.name).toBe('Unknown');
      expectClean(report);
    }
    expect(sanitizeError(withGetter).code).toBeUndefined();
  });
});

describe('reportRequestError (onRequestError → ErrorReporter)', () => {
  it('o adaptador recebe só o relatório filtrado', async () => {
    const reporter = new MemoryErrorReporter();
    await reportRequestError(poisonedError(), request, context, { reporter: () => reporter });
    expect(reporter.errors).toHaveLength(1);
    expectClean(reporter.errors);
  });

  it('o adaptador console grava no log só metadados', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ minLevel: 'debug', sink: (r) => records.push(r) });
    const reporter = new ConsoleErrorReporter({ logger });
    await reportRequestError(poisonedError(), request, context, { reporter: () => reporter });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: 'error',
      event: 'error.request',
      errorName: 'Error',
      route: '/(app)/corpo/[id]/page',
      routeType: 'action',
      method: 'POST',
    });
    expectClean(records);
  });

  it('falha ao relatar vira só error.report_failed, sem lançar', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ minLevel: 'debug', sink: (r) => records.push(r) });
    await expect(
      reportRequestError(poisonedError(), request, context, {
        logger,
        reporter: () => {
          throw new Error('dormi mal e chorei');
        },
      }),
    ).resolves.toBeUndefined();
    expect(records.map((r) => r.event)).toEqual(['error.report_failed']);
    expectClean(records);
  });
});

describe('erros de job (7c-R3)', () => {
  it('buildJobErrorReport usa a mesma lista de campos e nunca lê o payload', () => {
    const report = buildJobErrorReport(
      poisonedError(),
      { name: 'reports.build', id: 'job-1', attempt: 2, adapter: 'memory' },
      { id: 'r-2', now: new Date('2026-10-16T12:00:00.000Z') },
    );
    expectClean(report);
    expect(report).toEqual({
      id: 'r-2',
      occurredAt: '2026-10-16T12:00:00.000Z',
      source: 'job',
      error: { name: 'Error', cause: { name: 'Error', code: 'P2002' }, frames: expect.any(Array) },
      job: { name: 'reports.build', id: 'job-1', attempt: 2, adapter: 'memory' },
    });
  });

  it('nome, id, tentativa e adaptador fora do formato não passam', () => {
    const report = buildJobErrorReport(new Error('x'), {
      name: 'nota: dormi mal e chorei',
      id: 'maria.silva@exemplo.test',
      attempt: '82,5 kg',
      adapter: 'peso=82',
    });
    expect(report.job).toEqual({ name: 'unknown', id: 'unknown', attempt: -1, adapter: 'unknown' });
    expectClean(report);
  });

  it('a fila manda o erro do handler ao ErrorReporter e ao log sem dado (injeção)', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ minLevel: 'debug', sink: (r) => records.push(r) });
    const memory = new MemoryErrorReporter();
    const consoleReporter = new ConsoleErrorReporter({ logger });
    const queue = new MemoryJobQueue(logger, {
      onError: async (error, job) => {
        await createJobErrorSink(() => memory, logger)(error, job);
        await createJobErrorSink(() => consoleReporter, logger)(error, job);
      },
    });
    queue.register('privacy.account_purge', async () => {
      throw poisonedError();
    });
    await queue.enqueue('privacy.account_purge', {
      note: 'dormi mal e chorei',
      email: 'maria.silva@exemplo.test',
    });
    await queue.drain();
    expect(memory.errors).toHaveLength(1);
    expect(memory.errors[0]).toMatchObject({
      source: 'job',
      job: { name: 'privacy.account_purge', attempt: 1, adapter: 'memory' },
    });
    expect(records.map((r) => r.event)).toEqual(['job.failed', 'error.job']);
    expect(records[1]).toMatchObject({
      level: 'error',
      errorName: 'Error',
      jobName: 'privacy.account_purge',
      attempt: 1,
    });
    expectClean([memory.errors, records]);
  });

  it('nome de erro com dado vira Unknown também no job.failed', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ minLevel: 'debug', sink: (r) => records.push(r) });
    const queue = new MemoryJobQueue(logger);
    queue.register('reports.build', async () => {
      throw Object.assign(new Error('x'), { name: 'notas_dormi_mal 82,5 kg' });
    });
    await queue.enqueue('reports.build', {});
    await queue.drain();
    expect(records[0]).toMatchObject({ event: 'job.failed', errorCode: 'Unknown' });
    expectClean(records);
  });

  it('sink que lança ou trava não derruba nem segura a fila (revisão 7d, B2)', async () => {
    const job = { name: 'a.b', id: '1', attempt: 1, adapter: 'memory' };
    await expect(
      notifyJobError(
        async () => {
          throw new Error('dormi mal e chorei');
        },
        poisonedError(),
        job,
      ),
    ).resolves.toBeUndefined();
    const started = Date.now();
    await notifyJobError(() => new Promise<void>(() => undefined), poisonedError(), job, 50);
    expect(Date.now() - started).toBeLessThan(1000);

    const queue = new MemoryJobQueue(createLogger({ sink: () => undefined }), {
      onError: async () => {
        throw new Error('sink quebrado');
      },
    });
    queue.register('reports.build', async () => {
      throw new Error('x');
    });
    const id = await queue.enqueue('reports.build', {}, { maxAttempts: 1 });
    await queue.drain();
    expect(queue.statusOf(id)).toBe('failed');
  });

  it('falha ao relatar o job vira só error.report_failed, sem lançar', async () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ minLevel: 'debug', sink: (r) => records.push(r) });
    const sink = createJobErrorSink(() => {
      throw new Error('dormi mal e chorei');
    }, logger);
    await expect(
      sink(poisonedError(), { name: 'a.b', id: '1', attempt: 1, adapter: 'memory' }),
    ).resolves.toBeUndefined();
    expect(records.map((r) => r.event)).toEqual(['error.report_failed']);
    expectClean(records);
  });
});

describe('guarda do console (produção)', () => {
  it('erro impresso pelo Next sai reduzido; texto livre vira [redacted]', () => {
    const out = guardConsoleArgs([
      ' ⨯ ',
      poisonedError(),
      'nota: dormi mal e chorei',
      82.5,
      { x: 1 },
    ]);
    expect(out[0]).toBe('[redacted]');
    expect(JSON.parse(out[1] as string)).toMatchObject({ error: { name: 'Error' } });
    expect(out.slice(2)).toEqual(['[redacted]', 82.5, '[redacted]']);
    expectClean(out);
  });

  it('linha do logger passa, filtrada de novo', () => {
    const line = JSON.stringify({
      ts: '2026-10-16T12:00:00.000Z',
      level: 'warn',
      event: 'job.failed',
      jobName: 'privacy.purge_proofs',
      note: 'dormi mal e chorei',
    });
    expect(JSON.parse(guardConsoleArgs([line])[0] as string)).toEqual({
      ts: '2026-10-16T12:00:00.000Z',
      level: 'warn',
      event: 'job.failed',
      jobName: 'privacy.purge_proofs',
    });
    expect(guardConsoleArgs(['{"level":"toString","event":"x.y"}'])).toEqual(['[redacted]']);
  });

  it('instala uma vez só e filtra error e warn', () => {
    const printed: unknown[][] = [];
    const fake = {
      error: (...args: unknown[]) => printed.push(args),
      warn: (...args: unknown[]) => printed.push(args),
    } as unknown as Console;
    installConsoleGuard(fake);
    installConsoleGuard(fake);
    fake.error('peso=82', poisonedError());
    fake.warn('comi só uma maçã');
    expect(printed).toHaveLength(2);
    expectClean(printed);
  });
});
