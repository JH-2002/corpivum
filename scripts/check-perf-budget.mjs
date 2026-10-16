// Orçamento de performance na CI (§41, ADR-0039), depois do `pnpm build`:
// - JS de entrada por rota (gzip) dentro do teto de perf-budget.json, sem three.js na entrada (ADR-0026);
// - nenhum chunk do cliente acima de `maxChunkKiB` (inclui os carregados sob demanda, como o 3D);
// - cada .glb e o total dos modelos dentro do teto.
// O tempo até o dashboard ficar interativo (4G e CPU 4×) é medido pelo e2e/perf.spec.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { measureRoute } from './route-js.mjs';

const budget = JSON.parse(readFileSync('perf-budget.json', 'utf8'));
const kib = (bytes) => bytes / 1024;
const problems = [];

for (const [route, max] of Object.entries(budget.routes)) {
  const { gzipBytes, withThree } = measureRoute(route);
  const size = kib(gzipBytes);
  console.log(`${route}: ${size.toFixed(1)} / ${max} KiB gzip`);
  if (size > max) problems.push(`${route}: ${size.toFixed(1)} KiB > ${max} KiB`);
  if (withThree.length)
    problems.push(`${route}: three.js no JS de entrada (${withThree.join(', ')})`);
}

const chunksDir = join('.next', 'static', 'chunks');
let largest = { file: '', size: 0 };
for (const name of readdirSync(chunksDir, { recursive: true }).map(String)) {
  if (!name.endsWith('.js')) continue;
  const size = kib(gzipSync(readFileSync(join(chunksDir, name))).length);
  if (size > largest.size) largest = { file: name, size };
  if (size > budget.maxChunkKiB) {
    problems.push(`chunk ${name}: ${size.toFixed(1)} KiB > ${budget.maxChunkKiB} KiB`);
  }
}
console.log(
  `maior chunk: ${largest.file} ${largest.size.toFixed(1)} / ${budget.maxChunkKiB} KiB gzip`,
);

const { dir, maxFileKiB, maxTotalKiB } = budget.models;
let total = 0;
for (const name of readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
  const size = kib(statSync(join(dir, name)).size);
  total += size;
  console.log(`${name}: ${size.toFixed(1)} / ${maxFileKiB} KiB`);
  if (size > maxFileKiB) problems.push(`${name}: ${size.toFixed(1)} KiB > ${maxFileKiB} KiB`);
}
console.log(`modelos 3D: ${total.toFixed(1)} / ${maxTotalKiB} KiB`);
if (total > maxTotalKiB) problems.push(`modelos: ${total.toFixed(1)} KiB > ${maxTotalKiB} KiB`);

if (problems.length) {
  console.error(`Orçamento de performance estourado:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Orçamento de performance OK.');
