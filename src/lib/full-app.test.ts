// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const notFound = vi.fn(() => {
  throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
});
vi.mock('next/navigation', () => ({ notFound }));

const { assertFullApp } = await import('./full-app');

/** Guarda das actions e route handlers do app completo (ADR-0043). */
describe('assertFullApp', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    notFound.mockClear();
  });

  it('fora do modo só demo, segue', () => {
    expect(() => assertFullApp()).not.toThrow();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('no modo só demo, responde 404 (notFound) antes de qualquer trabalho', () => {
    vi.stubEnv('DEMO_ONLY', 'true');
    expect(() => assertFullApp()).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(notFound).toHaveBeenCalledOnce();
  });
});
