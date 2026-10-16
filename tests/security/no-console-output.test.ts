// @vitest-environment node
/**
 * 7c-R3 (LEG-R04, regra 5 do CLAUDE.md, ADR-0039): em `src/`, toda saída passa pelo logger de metadados. Este teste
 * estático lê a árvore sintática de cada arquivo (não só texto, então comentário não conta e `eslint-disable` não
 * escapa) e recusa: uso do `console` (inclusive `globalThis.console`, `console['log']` ou guardar o `console` numa
 * variável) e acesso a `process.stdout`/`process.stderr` (inclusive por desestruturação e por import de
 * `node:process`). Exceções: o próprio logger e a guarda do console, que substitui `console.error`/`warn` em
 * produção. O ESLint (`no-console`, `no-restricted-properties`) barra o mesmo no editor.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const ALLOWED = new Set(['lib/logger.ts', 'lib/observability/console-guard.ts']);
const STREAMS = new Set(['stdout', 'stderr']);

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true })
    .map((f) => String(f).split(path.sep).join('/'))
    .filter((f) => /\.(ts|tsx|mts|cts)$/.test(f) && !f.endsWith('.d.ts'))
    .filter((f) => !f.startsWith('generated/'));
}

function propertyName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return undefined;
}

function isGlobalObject(node: ts.Expression): boolean {
  return ts.isIdentifier(node) && ['globalThis', 'window', 'global', 'self'].includes(node.text);
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
    // `console` como valor (chamada, alias, argumento), fora de posição de nome de propriedade ou de tipo.
    if (ts.isIdentifier(node) && node.text === 'console') {
      const parent = node.parent;
      const isMemberName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        ts.isPropertySignature(parent) ||
        ts.isMethodDeclaration(parent);
      if (!isMemberName && !ts.isTypeReferenceNode(parent)) report(node, 'console');
    }
    // `globalThis.console`, `window['console']`.
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      propertyName(node) === 'console' &&
      isGlobalObject(node.expression)
    ) {
      report(node, 'globalThis.console');
    }
    // `process.stdout`, `process['stderr']`, `globalThis.process.stdout`.
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      STREAMS.has(propertyName(node) ?? '')
    ) {
      const target = node.expression;
      const isProcess =
        (ts.isIdentifier(target) && target.text === 'process') ||
        ((ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) &&
          propertyName(target) === 'process');
      if (isProcess) report(node, `process.${propertyName(node)}`);
    }
    // `const { stdout } = process`.
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === 'process'
    ) {
      for (const el of node.name.elements) {
        const key = (el.propertyName ?? el.name).getText(source);
        if (STREAMS.has(key)) report(el, `process.${key}`);
      }
    }
    // `import { stderr } from 'node:process'`.
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      ['process', 'node:process'].includes(node.moduleSpecifier.text)
    ) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          const key = (el.propertyName ?? el.name).text;
          if (STREAMS.has(key)) report(el, `process.${key}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('saída só pelo logger em src/ (7c-R3)', () => {
  it('nenhum arquivo usa console nem process.stdout/stderr fora do logger e da guarda', () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(100);
    const offenders = files
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) =>
        findForbiddenOutput(f, readFileSync(path.join(SRC, f), 'utf8')).map((hit) => `${f}:${hit}`),
      );
    expect(offenders).toEqual([]);
  });

  it('o detector pega as formas de contorno e ignora comentários e tipos', () => {
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
      'type T = Console;',
      'const o = { console: 1 };',
      'o.console;',
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
    ]);
  });
});
