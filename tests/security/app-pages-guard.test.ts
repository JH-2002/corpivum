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

  it('toda server action exportada em (app) valida a sessão no início', () => {
    const actionFiles = readdirSync(APP_DIR, { recursive: true })
      .map(String)
      .filter((f) => /(^|[\\/])actions\.ts$/.test(f))
      .map((f) => path.join(APP_DIR, f));
    expect(actionFiles.length).toBeGreaterThanOrEqual(1);
    for (const file of actionFiles) {
      const src = readFileSync(file, 'utf8');
      expect(src.startsWith("'use server'")).toBe(true);
      const bodies = src.split(/\nexport async function /).slice(1);
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) {
        const name = body.slice(0, body.indexOf('('));
        const firstLines = body.split('\n').slice(0, 3).join('\n');
        expect(firstLines, `${path.basename(path.dirname(file))}/${name}`).toMatch(
          /await requireVerifiedSession\(\)/,
        );
      }
    }
  });

  it('o layout também valida', () => {
    const layout = readFileSync(path.join(APP_DIR, 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/await requireVerifiedSession\(\)/);
  });
});
