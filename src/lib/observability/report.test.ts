// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/lib/logger';
import { reportRequestError } from './report';

/** Modo só demo (ADR-0043, D8): sem adaptadores, o relatório filtrado vai só ao log da hospedagem. */
describe('reportRequestError no modo só demo', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('relata pelo log estruturado sem passar pelos adaptadores (que não existem nesse modo)', async () => {
    vi.stubEnv('DEMO_ONLY', 'true');
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    await reportRequestError(
      new Error('falha'),
      { path: '/demo/sono', method: 'GET', headers: {} },
      { routerKind: 'App Router', routePath: '/demo/sono', routeType: 'render' },
    );
    expect(error.mock.calls.map(([event]) => event)).toEqual(['error.request']);
  });
});
