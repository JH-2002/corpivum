// JS inicial por rota a partir do build (`pnpm build` antes). O Next 16 não imprime mais o tamanho
// por rota; este script soma os chunks de entrada (rootMainFiles + entryJSFiles do manifesto da página),
// em bytes gzip, e aponta chunks de entrada que contêm o three.js (o 3D deve carregar sob demanda,
// ADR-0026). Uso: node scripts/route-js.mjs "(app)/inicio" demo "(app)/twin"
// O orçamento por rota (perf-budget.json) é conferido por scripts/check-perf-budget.mjs, que usa `measureRoute`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';

const NEXT = '.next';
const THREE_MARKER = 'WebGLRenderer';

/** Chunks de entrada de uma rota do build, em bytes gzip, e os que trazem o three.js. */
export function measureRoute(route) {
  const build = JSON.parse(readFileSync(join(NEXT, 'build-manifest.json'), 'utf8'));
  const file = join(NEXT, 'server', 'app', route, 'page_client-reference-manifest.js');
  const sandbox = { globalThis: {} };
  runInNewContext(readFileSync(file, 'utf8'), sandbox);
  const manifest = Object.values(sandbox.globalThis.__RSC_MANIFEST)[0];
  const chunks = new Set([...build.rootMainFiles, ...Object.values(manifest.entryJSFiles).flat()]);
  let gzipBytes = 0;
  const withThree = [];
  for (const chunk of chunks) {
    const code = readFileSync(join(NEXT, chunk));
    gzipBytes += gzipSync(code).length;
    if (code.includes(THREE_MARKER)) withThree.push(chunk);
  }
  return { chunks: chunks.size, gzipBytes, withThree };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const routes = process.argv.slice(2).map((r) => r.replace(/^\/+/, ''));
  if (routes.length === 0) {
    console.error('Uso: node scripts/route-js.mjs "(app)/inicio" ...');
    process.exit(2);
  }
  let failed = false;
  for (const route of routes) {
    const { chunks, gzipBytes, withThree } = measureRoute(route);
    console.log(
      `${route}: ${chunks} chunks, ${(gzipBytes / 1024).toFixed(1)} KiB gzip` +
        (withThree.length ? `, three.js na entrada: ${withThree.join(', ')}` : ''),
    );
    if (withThree.length) failed = true;
  }
  process.exit(failed ? 1 : 0);
}
