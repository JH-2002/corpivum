// Falha se algum arquivo SARIF do diretório tiver achados (CodeQL sem Code Scanning, ADR-0013).
// Uso: node scripts/check-sarif.mjs <diretório>
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? 'codeql-results';
let total = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.sarif'))) {
  const sarif = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
  for (const run of sarif.runs ?? []) {
    for (const result of run.results ?? []) {
      total += 1;
      const loc = result.locations?.[0]?.physicalLocation;
      const uri = loc?.artifactLocation?.uri ?? '?';
      const line = loc?.region?.startLine ?? 1;
      console.log(
        `::error file=${uri},line=${line}::${result.ruleId}: ${result.message?.text ?? ''}`,
      );
    }
  }
}

console.log(`CodeQL: ${total} achado(s).`);
process.exitCode = total > 0 ? 1 : 0;
