// @vitest-environment node
/**
 * LEG-S04 / ADR-0017: toda página da área logada valida a sessão no banco por conta própria.
 * Layouts do App Router não re-renderizam na navegação do cliente, então a guarda só no layout não basta.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = fileURLToPath(new URL('../../src/app/(app)', import.meta.url));

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === 'page.tsx' ? [full] : [];
  });
}

describe('guarda de sessão nas páginas de (app)', () => {
  const files = pages(APP_DIR);

  it('encontra as páginas', () => {
    expect(files.length).toBeGreaterThanOrEqual(18);
  });

  it.each(files.map((f) => [path.relative(APP_DIR, f), f]))(
    '%s chama requireVerifiedSession',
    (_, f) => {
      expect(readFileSync(f, 'utf8')).toMatch(/await requireVerifiedSession\(\)/);
    },
  );

  it('o layout também valida', () => {
    const layout = readFileSync(path.join(APP_DIR, 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/await requireVerifiedSession\(\)/);
  });
});
