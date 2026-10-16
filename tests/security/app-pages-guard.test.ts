// @vitest-environment node
/**
 * LEG-S04 / ADR-0017: toda página da área logada valida a sessão no banco por conta própria.
 * Layouts do App Router não re-renderizam na navegação do cliente, então a guarda só no layout não basta.
 * Fase 1b (ADR-0019): em `(app)`, a guarda é `requireAppSession` (sessão + onboarding + reconsentimento,
 * LEG-C06); em `(onboarding)`, uma das guardas de onboarding. As actions podem usar `requireAppSession` ou
 * `requireVerifiedSession` (segurança da conta e onboarding nunca ficam presos ao reconsentimento).
 * 7b (P7-B4, PR1a-R2-B8): varre todo arquivo com `'use server'` dos grupos autenticados (não só `actions.ts`),
 * inclusive `(presentation)`, e recusa export que não seja `export async function` (ex.: `export const x =
 * async`), que escaparia desta leitura das guardas.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = fileURLToPath(new URL('../../src/app/(app)', import.meta.url));
const ONBOARDING_DIR = fileURLToPath(new URL('../../src/app/(onboarding)', import.meta.url));
const PRESENTATION_DIR = fileURLToPath(new URL('../../src/app/(presentation)', import.meta.url));
/** Grupos autenticados: páginas, actions e rotas exigem sessão. */
const AUTH_DIRS = [APP_DIR, ONBOARDING_DIR, PRESENTATION_DIR];
/** Páginas que dispensam o reconsentimento pendente: Central de Privacidade e segurança da conta (P7-B3). */
const PENDING_UPDATE_PAGES = /privacidade|configuracoes[\\/]seguranca/;

const APP_GUARD = /await requireAppSession\((\{ allowPendingUpdate: true \})?\)/;
const ONBOARDING_GUARD = /await require(Onboarding|OnboardingExit|Update|DataChoice)Session\(\)/;
const ACTION_GUARD =
  /await require(AppSession\((\{ allowPendingUpdate: true \})?\)|VerifiedSession\(\)|OnboardingExitSession\(\))/;

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === 'page.tsx' ? [full] : [];
  });
}

/** Todo módulo de server actions (`'use server'` no topo), qualquer que seja o nome do arquivo. */
function serverActionFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => path.join(dir, f))
    .filter((f) => /^\s*['"]use server['"]/.test(readFileSync(f, 'utf8')));
}

describe('guarda de sessão nas páginas de (app) e (presentation)', () => {
  const files = [...pages(APP_DIR), ...pages(PRESENTATION_DIR)];

  it('encontra as páginas', () => {
    expect(files.length).toBeGreaterThanOrEqual(14);
  });

  it.each(files.map((f) => [path.relative(APP_DIR, f), f]))(
    '%s chama requireAppSession',
    (_, f) => {
      const src = readFileSync(f, 'utf8');
      expect(src).toMatch(APP_GUARD);
      // Só a Central de Privacidade e a segurança da conta dispensam o reconsentimento pendente (P7-B3).
      if (!PENDING_UPDATE_PAGES.test(f)) expect(src).not.toMatch(/allowPendingUpdate/);
    },
  );

  it('o layout também valida', () => {
    const layout = readFileSync(path.join(APP_DIR, 'layout.tsx'), 'utf8');
    expect(layout).toMatch(APP_GUARD);
  });
});

describe('guarda de sessão nas páginas de (onboarding)', () => {
  const files = pages(ONBOARDING_DIR);

  it('encontra as páginas', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it.each(files.map((f) => [path.relative(ONBOARDING_DIR, f), f]))('%s valida a sessão', (_, f) => {
    expect(readFileSync(f, 'utf8')).toMatch(ONBOARDING_GUARD);
  });
});

describe('route handlers dos grupos autenticados validam a sessão (ADR-0032: download)', () => {
  const files = AUTH_DIRS.flatMap((dir) =>
    readdirSync(dir, { recursive: true })
      .map(String)
      .filter((f) => /(^|[\\/])route\.ts$/.test(f))
      .map((f) => path.join(dir, f)),
  );

  it('encontra a rota de download', () => {
    expect(files.some((f) => f.includes('exportacoes'))).toBe(true);
  });

  it.each(files.map((f) => [path.relative(APP_DIR, f), f]))(
    '%s: todo método exportado começa pela guarda',
    (_, f) => {
      const src = readFileSync(f, 'utf8');
      const bodies = src.split(/\nexport async function /).slice(1);
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) {
        const afterOpen = body.slice(body.indexOf('{\n') + 2);
        expect(afterOpen.split('\n')[0]).toMatch(ACTION_GUARD);
      }
    },
  );
});

describe('server actions validam a sessão no início', () => {
  const files = AUTH_DIRS.flatMap(serverActionFiles);

  it('encontra as actions, inclusive as que não se chamam actions.ts', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(files.some((f) => f.endsWith('reminder-actions.ts'))).toBe(true);
  });

  it('só exporta `export async function` (outras formas escapariam desta leitura)', () => {
    for (const file of files) {
      const exports = readFileSync(file, 'utf8').match(
        /^export\s+(?!type\s|interface\s)\S+\s+\S+/gm,
      );
      for (const e of exports ?? []) {
        expect(e, path.relative(APP_DIR, file)).toBe('export async function');
      }
    }
  });

  it('toda server action exportada começa pela guarda', () => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const bodies = src.split(/\nexport async function /).slice(1);
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) {
        const name = body.slice(0, body.indexOf('('));
        // Assinaturas com parâmetros em várias linhas: a guarda vem logo após o `{` de abertura.
        const afterOpen = body.slice(body.indexOf('{\n') + 2);
        const firstLines = afterOpen.split('\n').slice(0, 2).join('\n');
        expect(firstLines, `${path.basename(path.dirname(file))}/${name}`).toMatch(ACTION_GUARD);
      }
    }
  });
});
