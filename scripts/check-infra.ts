// Checagem das regiões declaradas na CI (ADR-0036 D1, ADR-0040; LEG-S10): `infra/regions.json` contra as regiões
// do Brasil, o `.env.example`, `infra/retention.json` e `docs/privacy/SUBPROCESSORS.md`. Uso: pnpm check:infra.
// Sai com código 1 e a lista de motivos se algo falhar.
import { readFileSync } from 'node:fs';
import { checkInfraFiles } from '@/lib/infra-files';

const problems = checkInfraFiles({
  regionsJson: readFileSync('infra/regions.json', 'utf8'),
  retentionJson: readFileSync('infra/retention.json', 'utf8'),
  envExample: readFileSync('.env.example', 'utf8'),
  subprocessorsMd: readFileSync('docs/privacy/SUBPROCESSORS.md', 'utf8'),
});
if (problems.length > 0) {
  for (const p of problems) console.error(`infra: ${p}`);
  process.exit(1);
}
console.log('infra: todas as partes do sistema declaradas no Brasil (LEG-S10)');
