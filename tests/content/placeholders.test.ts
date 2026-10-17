// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Placeholders padronizados (LEG-G04, ADR-0041): todo `{{NOME}}` dos documentos, textos e declarações de infra
 * está no catálogo `docs/legal/PLACEHOLDERS.md`, e todo nome do catálogo ainda é usado em algum lugar.
 */
const ROOT = process.cwd();
const CATALOG = path.join('docs', 'legal', 'PLACEHOLDERS.md');
const SCANNED = ['docs', 'messages', 'legal', 'infra'];
const EXTENSIONS = new Set(['.md', '.json']);
const ANY = /\{\{([^{}]*)\}\}/g;
const VALID = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) return files(rel);
    return EXTENSIONS.has(path.extname(name)) ? [rel] : [];
  });
}

/** `{{...}}` é a notação genérica usada nos textos que falam dos placeholders, não um placeholder. */
function placeholders(text: string): string[] {
  return [...text.matchAll(ANY)].map((m) => m[1] ?? '').filter((name) => name !== '...');
}

const catalogText = readFileSync(path.join(ROOT, CATALOG), 'utf8');
const catalog = new Set(
  catalogText
    .split(/\r?\n/)
    .filter((line) => line.startsWith('| `{{'))
    .map((line) => line.match(/^\| `\{\{([^}]*)\}\}`/)?.[1] ?? ''),
);
const used = new Map<string, string[]>();
for (const file of SCANNED.flatMap(files)) {
  if (file === CATALOG) continue;
  for (const name of placeholders(readFileSync(path.join(ROOT, file), 'utf8'))) {
    used.set(name, [...(used.get(name) ?? []), file]);
  }
}

describe('placeholders padronizados', () => {
  it('o catálogo tem nomes válidos', () => {
    expect(catalog.size).toBeGreaterThan(0);
    expect([...catalog].filter((name) => !VALID.test(name))).toEqual([]);
  });

  it('nenhum placeholder vazio ou fora do formato', () => {
    const bad = [...used]
      .filter(([name]) => !VALID.test(name))
      .map(([n, f]) => `{{${n}}} em ${f[0]}`);
    expect(bad).toEqual([]);
  });

  it('todo placeholder usado está no catálogo', () => {
    const missing = [...used.keys()].filter((name) => !catalog.has(name)).sort();
    expect(missing, `adicione a ${CATALOG}`).toEqual([]);
  });

  it('todo nome do catálogo ainda é usado (preenchido = linha removida)', () => {
    const stale = [...catalog].filter((name) => !used.has(name)).sort();
    expect(stale).toEqual([]);
  });
});
