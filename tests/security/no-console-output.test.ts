// @vitest-environment node
/**
 * 7c-R3 (LEG-R04, regra 5 do CLAUDE.md, ADR-0039): em `src/`, toda saída passa pelo logger de metadados. Este teste
 * estático lê a árvore sintática de cada arquivo (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`; comentário não conta
 * e `eslint-disable` não escapa) e recusa:
 * - o `console` como valor (chamada, alias, `globalThis.console`, `console['log']`) e qualquer import ou `require`
 *   dos módulos `console`/`node:console`;
 * - `process` (ou `globalThis.process`) usado de outro jeito que não seja ler uma propriedade permitida: barra
 *   `stdout`, `stderr`, `emitWarning` e `_rawDebug`, o apelido (`const p = process`), o acesso calculado
 *   (`process[k]`), passar `process` adiante, a desestruturação dessas chaves e o import padrão ou de namespace de
 *   `process`/`node:process` (e o `require` deles);
 * - `writeSync(1, …)`/`writeSync(2, …)` (escrita direta nos descritores do stdout e do stderr).
 * Exceções: o próprio logger e a guarda do console (revisão obrigatória ao mexer neles). O ESLint (`no-console`,
 * `no-restricted-properties`) barra o mesmo no editor.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const ALLOWED = new Set(['lib/logger.ts', 'lib/observability/console-guard.ts']);
const BANNED_PROCESS = new Set(['stdout', 'stderr', 'emitWarning', '_rawDebug']);
const PROCESS_MODULES = new Set(['process', 'node:process']);
const CONSOLE_MODULES = new Set(['console', 'node:console']);
const GLOBALS = new Set(['globalThis', 'window', 'global', 'self']);

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true })
    .map((f) => String(f).split(path.sep).join('/'))
    .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(f) && !f.endsWith('.d.ts'))
    .filter((f) => !f.startsWith('generated/'));
}

type Member = ts.PropertyAccessExpression | ts.ElementAccessExpression;
const isMember = (n: ts.Node): n is Member =>
  ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n);

function propertyName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return undefined;
}

/** `process` ou `globalThis.process` (e equivalentes). */
function isProcessRef(node: ts.Node): boolean {
  if (ts.isIdentifier(node)) return node.text === 'process';
  return (
    isMember(node) &&
    propertyName(node) === 'process' &&
    ts.isIdentifier(node.expression) &&
    GLOBALS.has(node.expression.text)
  );
}

/** Módulo pedido por `require('x')`. */
function requiredModule(node: ts.Node): string | undefined {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'require' &&
    node.arguments[0] &&
    ts.isStringLiteralLike(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return undefined;
}

/** O identificador é só o nome de uma propriedade (`o.process`, `{ process: 1 }`), não a variável global. */
function isNameOnly(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    ts.isPropertySignature(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isTypeReferenceNode(parent) ||
    (ts.isBindingElement(parent) && parent.propertyName === node)
  );
}

function checkProcessUse(
  node: ts.Node,
  source: ts.SourceFile,
  report: (n: ts.Node, w: string) => void,
) {
  const parent = node.parent;
  if (isMember(parent) && parent.expression === node) {
    const key = propertyName(parent);
    if (key === undefined) report(parent, 'process[calculado]');
    else if (BANNED_PROCESS.has(key)) report(parent, `process.${key}`);
    return;
  }
  if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
    if (ts.isObjectBindingPattern(parent.name)) {
      for (const el of parent.name.elements) {
        const key = (el.propertyName ?? el.name).getText(source);
        if (BANNED_PROCESS.has(key) || el.dotDotDotToken) report(el, `process.${key}`);
      }
    } else {
      report(parent, 'apelido de process');
    }
    return;
  }
  if (ts.isTypeOfExpression(parent)) return;
  // Argumento, retorno, atribuição, `as`: o objeto escaparia da análise.
  report(node, 'process como valor');
}

/** Devolve `linha: trecho` de cada saída proibida. */
export function findForbiddenOutput(fileName: string, code: string): string[] {
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const report = (node: ts.Node, what: string) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push(`${line + 1}: ${what}`);
  };

  const visit = (node: ts.Node) => {
    // `console` como valor.
    if (ts.isIdentifier(node) && node.text === 'console' && !isNameOnly(node)) {
      report(node, 'console');
    }
    if (isMember(node) && propertyName(node) === 'console' && ts.isIdentifier(node.expression)) {
      if (GLOBALS.has(node.expression.text)) report(node, 'globalThis.console');
    }

    // `process`: só leitura de propriedade permitida (`process.env.X`, `process.cwd()`).
    if (ts.isIdentifier(node) && node.text === 'process' && !isNameOnly(node)) {
      checkProcessUse(node, source, report);
    }
    if (isMember(node) && isProcessRef(node)) checkProcessUse(node, source, report);

    // Imports e `require` de `console` e de `process`.
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const mod = node.moduleSpecifier.text;
      if (CONSOLE_MODULES.has(mod)) report(node, `import ${mod}`);
      if (PROCESS_MODULES.has(mod)) {
        const clause = node.importClause;
        if (clause?.name) report(clause, `import padrão de ${mod}`);
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) report(bindings, `import * de ${mod}`);
        if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) {
            const key = (el.propertyName ?? el.name).text;
            if (BANNED_PROCESS.has(key)) report(el, `process.${key}`);
          }
        }
      }
    }
    const required = requiredModule(node);
    if (required && (CONSOLE_MODULES.has(required) || PROCESS_MODULES.has(required))) {
      report(node, `require ${required}`);
    }

    // `fs.writeSync(1, …)` / `writeSync(2, …)`.
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : isMember(callee)
          ? propertyName(callee)
          : undefined;
      const fd = node.arguments[0];
      if (name === 'writeSync' && fd && ts.isNumericLiteral(fd) && ['1', '2'].includes(fd.text)) {
        report(node, `writeSync(${fd.text})`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('saída só pelo logger em src/ (7c-R3)', () => {
  it('nenhum arquivo usa console nem escreve direto no stdout/stderr fora do logger e da guarda', () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(100);
    const offenders = files
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) =>
        findForbiddenOutput(f, readFileSync(path.join(SRC, f), 'utf8')).map((hit) => `${f}:${hit}`),
      );
    expect(offenders).toEqual([]);
  });

  it('o detector pega as formas de contorno e ignora comentários, tipos e process.env', () => {
    const code = [
      '// console.log("comentário não conta")',
      '/* process.stdout.write("idem") */',
      'console.log("a");',
      'console["info"]("b");',
      'const c = console;',
      'globalThis.console.error("c");',
      'process.stdout.write("d");',
      "process['stderr'].write('e');",
      'const { stderr: s } = process;',
      "import { stdout } from 'node:process';",
      "import proc from 'node:process';",
      "import * as p2 from 'process';",
      'const p = process;',
      'const { stderr } = globalThis.process;',
      'globalThis.process.stdout.write("f");',
      'process.emitWarning("g");',
      'process._rawDebug("h");',
      'process[key].write("i");',
      'send(process);',
      "import { log } from 'node:console';",
      "require('node:console');",
      "require('process').stderr;",
      'fs.writeSync(2, "j");',
      'writeSync(1, "k");',
      'type T = Console;',
      'const o = { console: 1, process: 2 };',
      'o.console;',
      'o.process;',
      'const env = process.env.APP_ENV;',
      'const { env: e2 } = process;',
      'process.cwd();',
      'fs.writeSync(fd, "ok");',
    ].join('\n');
    expect(findForbiddenOutput('x.ts', code).map((h) => h.split(': ')[1])).toEqual([
      'console',
      'console',
      'console',
      'globalThis.console',
      'process.stdout',
      'process.stderr',
      'process.stderr',
      'process.stdout',
      'import padrão de node:process',
      'import * de process',
      'apelido de process',
      'process.stderr',
      'process.stdout',
      'process.emitWarning',
      'process._rawDebug',
      'process[calculado]',
      'process como valor',
      'import node:console',
      'require node:console',
      'require process',
      'writeSync(2)',
      'writeSync(1)',
    ]);
  });
});
