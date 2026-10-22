// Mensagens do navegador por rota (ADR-0052): `pnpm i18n:client` gera `src/i18n/client-namespaces.generated.ts`;
// o teste `src/i18n/client-messages.test.ts` refaz a análise e falha se o arquivo gerado estiver desatualizado.
//
// Análise estática dos imports (estáticos e `import()`): a partir de um arquivo `'use client'` (fronteira do
// cliente), junta os namespaces de `useTranslations('<ns>')` de tudo o que ele importa. `useTranslations()` sem
// namespace: o primeiro trecho das chaves literais do arquivo ("nav.x" → "nav"). Template com prefixo fixo
// (`pages.${page}`): o prefixo. Outro argumento não literal num componente de cliente faz a análise falhar.
// - Shell: layouts, `error`, `loading`, `not-found` e `template` (o que fica em volta das páginas).
// - Cada página (`page.tsx`): o que ela mesma renderiza; a chave é a pasta relativa a `src/app` ("/" na raiz).
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const APP = path.join(SRC, 'app');
const OUT = path.join(SRC, 'i18n', 'client-namespaces.generated.ts');
const EXTENSIONS = ['.tsx', '.ts', '/index.tsx', '/index.ts'];

/** Arquivos do App Router que ficam em volta das páginas (recebem as mensagens do shell). */
const SHELL_FILES = /^(layout|error|loading|not-found|global-error|template)\.tsx$/;

type Catalog = { [key: string]: string | Catalog };

interface Parsed {
  client: boolean;
  imports: string[];
  namespaces: Set<string>;
  /** Argumentos de `useTranslations` que não são literais. */
  dynamic: string[];
}

export interface ClientNamespaces {
  shell: string[];
  routes: Record<string, string[]>;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (/\.tsx?$/.test(base) && existsSync(base)) return base;
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  return null;
}

const cache = new Map<string, Parsed>();

function parse(file: string): Parsed {
  const cached = cache.get(file);
  if (cached) return cached;
  const code = readFileSync(file, 'utf8');
  const imports = [
    ...code.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g),
    ...code.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...code.matchAll(/^import\s+['"]([^'"]+)['"]/gm),
  ]
    .map((m) => resolveImport(file, m[1]!))
    .filter((f): f is string => f !== null);
  const namespaces = new Set<string>();
  const dynamic: string[] = [];
  for (const [, arg = ''] of code.matchAll(/useTranslations\(([^)]*)\)/g)) {
    const a = arg.trim();
    if (a === '') {
      // Tradutor sem namespace: o primeiro trecho de toda chave literal com ponto.
      for (const m of code.matchAll(/['"`]([a-z][A-Za-z]*)\.[A-Za-z$]/g)) namespaces.add(m[1]!);
      continue;
    }
    const literal = /^['"]([A-Za-z.]+)['"]$/.exec(a);
    // Template com prefixo fixo (`pages.${page}`): o prefixo cobre todas as chaves possíveis.
    const prefix = /^`([A-Za-z.]+?)\.?\$\{/.exec(a);
    if (literal) namespaces.add(literal[1]!);
    else if (prefix) namespaces.add(prefix[1]!);
    else dynamic.push(a);
  }
  // A diretiva pode vir depois de comentários e linhas em branco.
  const client = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use client['"]/.test(code);
  const parsed = { client, imports, namespaces, dynamic };
  cache.set(file, parsed);
  return parsed;
}

/** Namespaces usados por componentes de cliente alcançáveis a partir dos arquivos de entrada. */
function scanFrom(entries: string[]): Set<string> {
  const result = new Set<string>();
  const seen = new Set<string>();
  const stack: Array<[string, boolean]> = entries.map((file) => [file, false]);
  for (let item = stack.pop(); item; item = stack.pop()) {
    const [file, inClient] = item;
    const key = `${file}|${inClient}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const p = parse(file);
    const client = inClient || p.client;
    if (client) {
      if (p.dynamic.length) {
        throw new Error(
          `${path.relative(ROOT, file)}: useTranslations(${p.dynamic[0]}) não é literal`,
        );
      }
      for (const ns of p.namespaces) result.add(ns);
    }
    for (const dep of p.imports) stack.push([dep, client]);
  }
  return result;
}

/** Só caminhos que existem no catálogo, sem os cobertos por um ancestral ("twin" cobre "twin.body"), em ordem. */
function normalize(set: Set<string>, catalog: Catalog): string[] {
  const valid = [...set].filter((ns) => {
    let node: string | Catalog | undefined = catalog;
    for (const part of ns.split('.')) {
      if (typeof node !== 'object' || !(part in node)) return false;
      node = node[part];
    }
    return true;
  });
  return valid
    .filter((ns) => !valid.some((other) => other !== ns && ns.startsWith(`${other}.`)))
    .sort();
}

/** Chave da página: a pasta relativa a `src/app`, com "/" ("/" na raiz). */
export function routeKey(pageFile: string): string {
  const dir = path.relative(APP, path.dirname(pageFile)).split(path.sep).join('/');
  return dir === '' ? '/' : dir;
}

export function pageFiles(): string[] {
  return listFiles(APP).filter((f) => path.basename(f) === 'page.tsx');
}

export function scan(): ClientNamespaces {
  const catalog = JSON.parse(
    readFileSync(path.join(ROOT, 'messages', 'pt-BR.json'), 'utf8'),
  ) as Catalog;
  const shellFiles = listFiles(APP).filter((f) => SHELL_FILES.test(path.basename(f)));
  return {
    shell: normalize(scanFrom(shellFiles), catalog),
    routes: Object.fromEntries(
      pageFiles()
        .map((f): [string, string[]] => [routeKey(f), normalize(scanFrom([f]), catalog)])
        .sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
  };
}

const list = (items: readonly string[]) => `[${items.map((ns) => `'${ns}'`).join(', ')}]`;

export function render({ shell, routes }: ClientNamespaces): string {
  const body = Object.entries(routes)
    .map(([route, items]) => `  '${route}': ${list(items)},`)
    .join('\n');
  return `// Gerado por \`pnpm i18n:client\` (scripts/i18n-client-namespaces.ts). Não edite à mão.
// Namespaces das mensagens que o navegador recebe (ADR-0052): o shell em volta das páginas e cada página.
export const SHELL_NAMESPACES: readonly string[] = ${list(shell)};

export const ROUTE_NAMESPACES = {
${body}
} as const satisfies Record<string, readonly string[]>;
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const map = scan();
  if (process.argv.includes('--write')) writeFileSync(OUT, render(map));
  else process.stdout.write(render(map));
}
