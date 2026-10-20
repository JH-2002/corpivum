// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { DEMO_FORBIDDEN_VARS, parseDemoEnv } from './demo-env';
import { envSchema } from './env';
import { EnvValidationError } from './errors';

/** Ambiente do modo só demo (ADR-0043): mínimo, no Brasil e sem nenhuma credencial do app completo. */
const production = {
  APP_ENV: 'production',
  APP_URL: 'https://corpivum.vercel.app',
  APP_REGION: 'gru1',
  CLIENT_IP_HEADER: 'x-real-ip',
};

function issuesOf(source: Record<string, string | undefined>): readonly string[] {
  try {
    parseDemoEnv(source);
  } catch (error) {
    if (error instanceof EnvValidationError) return error.issues;
    throw error;
  }
  return [];
}

/** Campos de texto livre do app completo que não são credenciais (podem existir na demo ou ser ignorados). */
const NON_SECRET_TEXT = ['APP_REGION', 'APP_URL', 'CLIENT_IP_HEADER', 'STORAGE_LOCAL_DIR'];

function baseType(schema: z.ZodType): string {
  let def = schema._zod.def as { type: string; innerType?: z.ZodType };
  while ((def.type === 'optional' || def.type === 'default') && def.innerType) {
    def = def.innerType._zod.def as typeof def;
  }
  return def.type;
}

describe('DEMO_FORBIDDEN_VARS acompanha o ambiente do app completo', () => {
  it('todo campo de texto do envSchema é credencial proibida na demo ou está na lista dos não secretos', () => {
    const text = Object.entries(envSchema.shape)
      .filter(([, schema]) => baseType(schema) === 'string')
      .map(([key]) => key);
    expect(text.length).toBeGreaterThan(10);
    const unclassified = text.filter(
      (key) =>
        !(DEMO_FORBIDDEN_VARS as readonly string[]).includes(key) && !NON_SECRET_TEXT.includes(key),
    );
    expect(unclassified).toEqual([]);
  });
});

describe('parseDemoEnv', () => {
  it('aceita a produção mínima, sem banco nem segredos', () => {
    expect(parseDemoEnv(production)).toEqual(production);
  });

  it.each(DEMO_FORBIDDEN_VARS)('recusa %s definida, e a mensagem não traz o valor', (key) => {
    const issues = issuesOf({ ...production, [key]: 'segredo-que-nao-pode-vazar' });
    expect(issues.some((i) => i.startsWith(key))).toBe(true);
    expect(issues.join(' ')).not.toContain('segredo-que-nao-pode-vazar');
  });

  it('variável vazia conta como ausente (a hospedagem pode deixá-la em branco)', () => {
    expect(issuesOf({ ...production, DATABASE_URL: '' })).toEqual([]);
  });

  it('em produção exige https, região no Brasil e cabeçalho de IP', () => {
    expect(issuesOf({ ...production, APP_URL: 'http://corpivum.vercel.app' })).toEqual([
      expect.stringMatching(/^APP_URL/),
    ]);
    expect(issuesOf({ ...production, APP_REGION: 'iad1' })).toEqual([
      expect.stringMatching(/^APP_REGION/),
    ]);
    expect(issuesOf({ ...production, APP_REGION: undefined })).toEqual([
      expect.stringMatching(/^APP_REGION/),
    ]);
    expect(issuesOf({ ...production, CLIENT_IP_HEADER: undefined })).toEqual([
      expect.stringMatching(/^CLIENT_IP_HEADER/),
    ]);
  });

  it('recusa x-forwarded-for como cabeçalho de IP (controlado pelo cliente)', () => {
    expect(issuesOf({ ...production, CLIENT_IP_HEADER: 'x-forwarded-for' })).toEqual([
      expect.stringMatching(/^CLIENT_IP_HEADER/),
    ]);
  });

  it('fora de produção (e2e local), http e sem região são aceitos; as credenciais continuam proibidas', () => {
    expect(issuesOf({ APP_ENV: 'test', APP_URL: 'http://localhost:3200' })).toEqual([]);
    expect(
      issuesOf({ APP_ENV: 'test', APP_URL: 'http://localhost:3200', SESSION_SECRET: 'x' }),
    ).toEqual([expect.stringMatching(/^SESSION_SECRET/)]);
  });
});
