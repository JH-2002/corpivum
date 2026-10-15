// Checagem da política de retenção na CI (ADR-0035; LEG-S07, LEG-R02, LEG-D03): `.env.example` e
// `infra/retention.json`. Uso: pnpm check:retention. Sai com código 1 e a lista de motivos se algo falhar.
import { readFileSync } from 'node:fs';
import { checkRetentionFiles } from '@/lib/retention-files';

const problems = checkRetentionFiles(
  readFileSync('.env.example', 'utf8'),
  readFileSync('infra/retention.json', 'utf8'),
);
if (problems.length > 0) {
  for (const p of problems) console.error(`retenção: ${p}`);
  process.exit(1);
}
console.log('retenção: .env.example e infra/retention.json dentro da política');
