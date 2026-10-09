import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Fronteiras do Health Twin (ADR-0026, §41, LEG-M04):
 * - three.js e react-three-fiber só em `src/components/twin/scene/**`, e essa pasta só é carregada por
 *   `import()` dinâmico em `LazyScenes.tsx`: o 3D nunca entra no JS do dashboard nem das outras telas;
 * - um único loader (`scene/assets.ts`), só para os `.glb` do próprio app em `/models/`; nenhuma URL
 *   absoluta nas cenas (ADR-0028, LEG-S10, docs/ASSETS.md);
 * - o twin não usa IMC.
 */
const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');
const SCENE_DIR = path.join(SRC, 'components', 'twin', 'scene');
const LAZY_FILE = path.join(SRC, 'components', 'twin', 'LazyScenes.tsx');
const ASSETS_FILE = path.join(SCENE_DIR, 'assets.ts');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'generated' ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const files = walk(SRC).map((file) => ({ file, code: readFileSync(file, 'utf8') }));
/** Código sem comentários (os comentários do twin dizem "sem IMC"). */
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const rel = (file: string) => path.relative(ROOT, file).replaceAll('\\', '/');
const inScene = (file: string) => file.startsWith(SCENE_DIR + path.sep);

const THREE_IMPORT = /from\s+['"](three|three\/[^'"]*|@react-three\/[^'"]+)['"]/;
const STATIC_SCENE_IMPORT = /(?:from|import)\s+['"][^'"]*\/scene\/[^'"]*['"]/;

describe('fronteira do 3D (ADR-0026)', () => {
  it('three.js e react-three-fiber só dentro de components/twin/scene', () => {
    const offenders = files.filter((f) => THREE_IMPORT.test(f.code) && !inScene(f.file));
    expect(offenders.map((f) => rel(f.file))).toEqual([]);
  });

  it('as cenas só são carregadas por import() dinâmico em LazyScenes', () => {
    const importers = files.filter((f) => !inScene(f.file) && /\/scene\//.test(f.code));
    expect(importers.map((f) => rel(f.file))).toEqual([rel(LAZY_FILE)]);
    const lazy = readFileSync(LAZY_FILE, 'utf8');
    expect(lazy).not.toMatch(STATIC_SCENE_IMPORT);
    expect(lazy).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\('\.\/scene\/BodyScene'\)/);
    expect(lazy).toMatch(/ssr:\s*false/);
  });

  it('sem @react-three/drei; loader só em scene/assets.ts e nenhuma URL absoluta (ADR-0028)', () => {
    expect(
      files.filter((f) => f.code.includes('@react-three/drei')).map((f) => rel(f.file)),
    ).toEqual([]);
    const scene = files.filter((f) => inScene(f.file));
    expect(scene.length).toBeGreaterThan(0);
    const loaders = scene.filter((f) =>
      /\w+Loader\b|useLoader|fetch\(/.test(stripComments(f.code)),
    );
    expect(loaders.map((f) => rel(f.file))).toEqual([rel(ASSETS_FILE)]);
    // Código bruto: `stripComments` apagaria o resto de uma URL depois de "//".
    for (const { file, code } of scene) {
      expect({
        file: rel(file),
        url: /https?:\/\/|['"`]\/\/[a-z0-9.-]+/i.test(code),
      }).toEqual({
        file: rel(file),
        url: false,
      });
    }
    // Só o caminho relativo do próprio app, validado antes de carregar.
    expect(readFileSync(ASSETS_FILE, 'utf8')).toContain('^\\/models\\/');
  });

  it('o twin não usa IMC (LEG-M04)', () => {
    // Testes ficam de fora: eles conferem justamente a ausência de IMC.
    const twin = files.filter(
      (f) => /[\\/]twin[\\/]/.test(f.file) && !/\.test\.tsx?$/.test(f.file),
    );
    expect(twin.length).toBeGreaterThan(0);
    const offenders = twin.filter((f) => /\bbmi\b|\bimc\b/i.test(stripComments(f.code)));
    expect(offenders.map((f) => rel(f.file))).toEqual([]);
  });
});
