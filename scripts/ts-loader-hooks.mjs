import { existsSync, statSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const EMPTY = 'data:text/javascript,export {};';

function probe(base) {
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: EMPTY, shortCircuit: true };
  let base = null;
  if (specifier.startsWith('@/')) base = resolvePath(ROOT, 'src', specifier.slice(2));
  else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const parent = fileURLToPath(context.parentURL);
    if (!parent.includes('node_modules')) base = resolvePath(dirname(parent), specifier);
  }
  if (base) {
    const file = probe(base);
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  return next(specifier, context);
}
