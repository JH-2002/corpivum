// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDemoOnly } from './demo-mode';
import { getEnv } from './env';
import { EnvValidationError, NotEnabledError } from './errors';

/** Modo só demo (ADR-0043): a chave e o bloqueio do app completo. */
describe('isDemoOnly', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['true', true],
  ])('DEMO_ONLY=%s → %s', (value, expected) => {
    expect(isDemoOnly({ DEMO_ONLY: value })).toBe(expected);
  });

  it.each(['1', 'TRUE', 'yes', 'on'])('valor ambíguo (%s) falha alto', (value) => {
    expect(() => isDemoOnly({ DEMO_ONLY: value })).toThrow(EnvValidationError);
  });
});

describe('getEnv no modo só demo', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('recusa: banco, adaptadores e segredos do app completo ficam inacessíveis', () => {
    vi.stubEnv('DEMO_ONLY', 'true');
    expect(() => getEnv()).toThrow(NotEnabledError);
  });
});
