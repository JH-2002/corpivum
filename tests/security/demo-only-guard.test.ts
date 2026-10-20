// @vitest-environment node
/**
 * Modo só demo (ADR-0043): uma server action é alcançável por POST direto com o ID dela, de qualquer caminho,
 * então o proxy não basta. Toda action e todo route handler do app completo começa por `assertFullApp()`.
 * Só as actions de preferência da demo ficam fora, e elas não podem tocar em sessão, banco nem adaptadores.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/');

/** Actions que valem na demo pública: só preferências de interface em cookie de sessão. */
const DEMO_ACTIONS = [
  'app/period-actions.ts',
  'app/presentation-actions.ts',
  'app/privacy-mode-actions.ts',
];

const files = readdirSync(SRC, { recursive: true })
  .map(String)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => path.join(SRC, f));
const actionFiles = files.filter((f) => /^\s*['"]use server['"]/.test(readFileSync(f, 'utf8')));
const routeFiles = files.filter((f) => /(^|[\\/])route\.ts$/.test(f));

function bodies(src: string): string[] {
  return src.split(/\nexport async function /).slice(1);
}

describe('guarda do modo só demo nas actions e route handlers', () => {
  it('encontra as actions e a lista da demo existe', () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(17);
    for (const demo of DEMO_ACTIONS) expect(actionFiles.map(rel)).toContain(demo);
    expect(routeFiles.length).toBeGreaterThanOrEqual(1);
  });

  const guarded = [...actionFiles, ...routeFiles].filter((f) => !DEMO_ACTIONS.includes(rel(f)));

  it.each(guarded.map((f) => [rel(f), f]))('%s: todo export começa por assertFullApp()', (_, f) => {
    const src = readFileSync(f, 'utf8');
    // Outras formas de export (`export const x = async`, `export default`, `export { x }`) escapariam desta leitura.
    expect(src).not.toMatch(/^export\s+(const|let|var|default|\{|\*)/m);
    expect(src).toMatch(/^import \{ assertFullApp \} from '@\/lib\/full-app';$/m);
    const list = bodies(src);
    expect(list.length).toBeGreaterThan(0);
    for (const body of list) {
      const name = body.slice(0, body.indexOf('('));
      const firstLine = body.slice(body.indexOf('{\n') + 2).split('\n')[0];
      expect(firstLine, name).toBe('  assertFullApp();');
    }
  });

  it.each(DEMO_ACTIONS)('%s não alcança sessão, banco nem adaptadores', (file) => {
    const src = readFileSync(path.join(SRC, file), 'utf8');
    expect(src).not.toMatch(
      /@\/(lib\/db|lib\/env|adapters|modules\/(auth|consent|privacy|reports|health))/,
    );
  });
});

describe('o modo só demo está ligado nas entradas do servidor', () => {
  it('o proxy aplica o roteamento da demo antes do redirecionamento para /entrar', () => {
    const src = readFileSync(path.join(SRC, 'proxy.ts'), 'utf8');
    const demo = src.indexOf('demoOnlyRoute(pathname');
    expect(demo).toBeGreaterThan(0);
    expect(demo).toBeLessThan(src.indexOf('const toLogin'));
  });

  it('a subida do servidor confere o ambiente da demo e não registra jobs', () => {
    const src = readFileSync(path.join(SRC, 'instrumentation.ts'), 'utf8');
    const demo = src.indexOf('parseDemoEnv(process.env)');
    expect(demo).toBeGreaterThan(0);
    expect(demo).toBeLessThan(src.indexOf("import('./server-jobs')"));
  });
});
