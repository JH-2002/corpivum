import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { messages } from '@/i18n/messages';

const ROOT = path.resolve(__dirname, '../..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/**
 * Inventário do armazenamento no navegador (ADR-0048, OI-40): toda chave de `localStorage` criada pelo código
 * aparece na ROPA (T2b). Uma chave nova sem registro faz o teste falhar.
 */
describe('inventário do armazenamento no navegador', () => {
  /** Constantes `*_STORAGE_KEY` e chaves literais em `useStoredValue(...)` ou `local/sessionStorage.setItem(...)`. */
  const PATTERNS = [
    /STORAGE_KEY\s*=\s*'([^']+)'/g,
    /useStoredValue\(\s*'(?:local|session)'\s*,\s*'([^']+)'/g,
    /(?:local|session)Storage\.setItem\(\s*'([^']+)'/g,
  ];
  const keys = [
    ...new Set(
      sources(path.join(ROOT, 'src')).flatMap((file) => {
        const text = readFileSync(file, 'utf8');
        return PATTERNS.flatMap((re) => [...text.matchAll(re)].map((m) => m[1] ?? ''));
      }),
    ),
  ];

  it('encontra as chaves conhecidas', () => {
    expect(keys.sort()).toEqual([
      'hm.demo.twin.bodyModel',
      'hm.motion',
      'hm.twin.bodyModel',
      'hm_tour_demo_seen',
    ]);
  });

  it('toda chave está na ROPA', () => {
    const ropa = readFileSync(path.join(ROOT, 'docs/privacy/ROPA.md'), 'utf8');
    for (const key of keys) expect(ropa, key).toContain(`\`${key}`);
  });

  it('"Sobre esta demonstração" cita tour, modelo do corpo e animações', () => {
    const body = messages.demoAbout.browser.body;
    expect(body).toMatch(/tour/);
    expect(body).toMatch(/modelo do corpo 3D/);
    expect(body).toMatch(/reduzir as animações/);
  });
});
