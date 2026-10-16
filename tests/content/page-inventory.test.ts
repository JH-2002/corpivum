// @vitest-environment node
/**
 * LEG-X01 (7d): toda página do App Router está no inventário do e2e (`e2e/routes.ts`), que roda o axe em cada
 * uma nos temas claro e escuro. Página nova sem entrada no inventário = teste vermelho.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PAGES } from '../../e2e/routes';

const APP = fileURLToPath(new URL('../../src/app', import.meta.url));

function pageDirs(): string[] {
  return readdirSync(APP, { recursive: true })
    .map((f) => String(f).split(path.sep).join('/'))
    .filter((f) => f === 'page.tsx' || f.endsWith('/page.tsx'))
    .map((f) => f.slice(0, -'page.tsx'.length).replace(/\/$/, ''))
    .sort();
}

describe('inventário de páginas do e2e', () => {
  it('cobre exatamente as páginas de src/app', () => {
    expect(PAGES.map((p) => p.file).sort()).toEqual(pageDirs());
  });

  it('não repete caminho e só a raiz é redirecionamento', () => {
    const paths = PAGES.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(PAGES.filter((p) => p.access === 'redirect').map((p) => p.path)).toEqual(['/']);
  });
});
