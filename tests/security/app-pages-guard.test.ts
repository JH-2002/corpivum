// @vitest-environment node
/**
 * LEG-S04 / ADR-0017: toda página da área logada valida a sessão no banco por conta própria.
 * Layouts do App Router não re-renderizam na navegação do cliente, então a guarda só no layout não basta.
 * Fase 1b (ADR-0019): em `(app)`, a guarda é `requireAppSession` (sessão + onboarding + reconsentimento,
 * LEG-C06); em `(onboarding)`, uma das guardas de onboarding. As actions podem usar `requireAppSession` ou
 * `requireVerifiedSession` (segurança da conta e onboarding nunca ficam presos ao reconsentimento).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = fileURLToPath(new URL('../../src/app/(app)', import.meta.url));
const ONBOARDING_DIR = fileURLToPath(new URL('../../src/app/(onboarding)', import.meta.url));

const APP_GUARD = /await requireAppSession\((\{ allowPendingUpdate: true \})?\)/;
const ONBOARDING_GUARD = /await require(Onboarding|Update|DataChoice)Session\(\)/;
const ACTION_GUARD =
  /await require(AppSession\((\{ allowPendingUpdate: true \})?\)|VerifiedSession\(\))/;

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === 'page.tsx' ? [full] : [];
  });
}

function actionFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => /(^|[\\/])actions\.ts$/.test(f))
    .map((f) => path.join(dir, f));
}

describe('guarda de sessão nas páginas de (app)', () => {
  const files = pages(APP_DIR);

  it('encontra as páginas', () => {
    expect(files.length).toBeGreaterThanOrEqual(14);
  });

  it.each(files.map((f) => [path.relative(APP_DIR, f), f]))(
    '%s chama requireAppSession',
    (_, f) => {
      const src = readFileSync(f, 'utf8');
      expect(src).toMatch(APP_GUARD);
      // Só a Central de Privacidade dispensa o reconsentimento pendente.
      if (!f.includes('privacidade')) expect(src).not.toMatch(/allowPendingUpdate/);
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

describe('server actions validam a sessão no início', () => {
  const files = [...actionFiles(APP_DIR), ...actionFiles(ONBOARDING_DIR)];

  it('encontra as actions', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it('toda server action exportada começa pela guarda', () => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      expect(src.startsWith("'use server'")).toBe(true);
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
