// Reaplica funções alteradas de uma migração JÁ aplicada nos bancos LOCAIS e acerta o checksum dela.
// Uso: pnpm db:resync-migration <pasta_da_migracao> <funcao> [<funcao>...]
//   ex.: pnpm db:resync-migration 20261016160000_fase_7b_revisao exports_mark_file_deleted
// Só para desenvolvimento, quando uma migração da branch em curso muda depois de aplicada (o `prisma migrate dev`
// pediria para apagar o banco). Nunca em migração que já está na `main`: mudança ali vira migração nova.
// Recria apenas os blocos `CREATE [OR REPLACE] FUNCTION app.<funcao>(...) ... $$;` do arquivo e grava o
// checksum do arquivo inteiro em `_prisma_migrations`, no banco de desenvolvimento e no de testes.
// Imprime só o nome do banco e a quantidade de blocos; nunca credenciais ou dados.
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const [name, ...fnNames] = process.argv.slice(2);
if (!name || !/^\d{14}_[a-z0-9_]+$/.test(name) || fnNames.length === 0) {
  console.error('Uso: pnpm db:resync-migration <pasta_da_migracao> <funcao> [<funcao>...]');
  process.exit(1);
}
const badFn = fnNames.find((fn) => !/^[a-z_][a-z0-9_]*$/.test(fn));
if (badFn) {
  console.error(`Nome de função inválido: ${badFn}`);
  process.exit(1);
}

const file = `prisma/migrations/${name}/migration.sql`;
const sql = fs.readFileSync(file, 'utf8');
if (sql.includes('\r\n')) {
  // O checksum do Prisma é do arquivo como está; com CRLF ele diverge da CI (.gitattributes força LF).
  console.error(
    `${file} tem CRLF. Rode: git add --renormalize prisma/migrations && git checkout -- ${file}`,
  );
  process.exit(1);
}
const checksum = crypto.createHash('sha256').update(sql).digest('hex');

const blocks = [];
for (const fn of fnNames) {
  const re = new RegExp(String.raw`CREATE (OR REPLACE )?FUNCTION app\.${fn}\([\s\S]*?\n\$\$;`, 'g');
  const found = [...sql.matchAll(re)].map((m) =>
    m[0].replace(/^CREATE FUNCTION/, 'CREATE OR REPLACE FUNCTION'),
  );
  if (found.length === 0) {
    console.error(`app.${fn} não aparece em ${file}`);
    process.exit(1);
  }
  blocks.push(...found);
}

const urls = [process.env.MIGRATION_DATABASE_URL, process.env.TEST_MIGRATION_DATABASE_URL].filter(
  Boolean,
);
if (urls.length === 0) {
  console.error(
    'MIGRATION_DATABASE_URL (e, se houver, TEST_MIGRATION_DATABASE_URL) precisa estar definida.',
  );
  process.exit(1);
}
for (const url of urls) {
  const parsed = new URL(url);
  // O `pg` aceita `?host=`/`?hostaddr=`, que substituem o host da URL: recusados (revisão B2 da 7c).
  if (
    !LOCAL_HOSTS.has(parsed.hostname) ||
    parsed.searchParams.has('host') ||
    parsed.searchParams.has('hostaddr')
  ) {
    console.error('Recusado: só bancos locais (localhost).');
    process.exit(1);
  }
}

try {
  for (const url of urls) {
    const db = new URL(url).pathname.slice(1);
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const { rows } = await client.query(
        'SELECT 1 FROM _prisma_migrations WHERE migration_name = $1 AND finished_at IS NOT NULL',
        [name],
      );
      if (rows.length === 0) {
        console.log(`${db}: migração ainda não aplicada; nada a fazer (use pnpm db:deploy)`);
        continue;
      }
      await client.query('BEGIN');
      for (const block of blocks) await client.query(block);
      await client.query('UPDATE _prisma_migrations SET checksum = $1 WHERE migration_name = $2', [
        checksum,
        name,
      ]);
      await client.query('COMMIT');
      console.log(`${db}: ${blocks.length} função(ões) recriada(s) e checksum atualizado`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      await client.end();
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'falha');
  process.exit(1);
}
