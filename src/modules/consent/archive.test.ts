// @vitest-environment node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Textos superados continuam verificáveis (LEG-R03, revisão de privacidade M1): o hash do JSON arquivado
 * bate com o publicado nas migrações (`policy_versions`), na mesma serialização do catálogo.
 */
const ARCHIVE = path.join(process.cwd(), 'legal', 'archive');
const MIGRATIONS = path.join(process.cwd(), 'prisma', 'migrations');

function publishedHash(document: string, version: number): string | undefined {
  const pattern = new RegExp(`'${document}',\\s*${version},\\s*'([0-9a-f]{64})'`);
  for (const dir of readdirSync(MIGRATIONS)) {
    if (dir.endsWith('.toml')) continue;
    const sql = readFileSync(path.join(MIGRATIONS, dir, 'migration.sql'), 'utf8');
    const match = sql.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}

describe('arquivo de textos superados', () => {
  const files = readdirSync(ARCHIVE).filter((f) => f.endsWith('.json'));

  it('tem o consentimento de saúde v1', () => {
    expect(files).toContain('consent_health_data.v1.json');
  });

  it.each(files)('%s: hash confere com a versão publicada', (file) => {
    const match = file.match(/^(\w+)\.v(\d+)\.json$/);
    expect(match, file).not.toBeNull();
    const [, document = '', version = '0'] = match ?? [];
    const text: unknown = JSON.parse(readFileSync(path.join(ARCHIVE, file), 'utf8'));
    const hash = createHash('sha256').update(JSON.stringify(text)).digest('hex');
    expect(hash).toBe(publishedHash(document, Number(version)));
  });
});
