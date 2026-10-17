// Backup cifrado, restauração isolada e reaplicação (ADR-0040; LEG-S07, LEG-D04, LEG-R03; P7-M3).
// Runbook: docs/runbooks/BACKUP_RESTORE.md. Uso:
//   pnpm backup:create                         dump cifrado do banco de MIGRATION_DATABASE_URL em .backups/
//   pnpm backup:ledger [--since <iso>]          livro cifrado das mudanças desde --since (padrão: retenção dos
//                                              backups), para reaplicar se a origem se perder
//   pnpm backup:restore <arquivo> (--source | --ledger <arquivo> | --no-source) [--target <nome>_restore]
//                                              restaura num banco ISOLADO, aplica as migrações, confere papéis e
//                                              contagens e reaplica o que mudou depois do backup
//   Na reaplicação: --dry-run só mostra o plano; acima de max(5, 1% das contas) removidas, exige
//   --confirm-closures <total> (revisão A2). --source e backup:ledger usam BACKUP_DATABASE_URL (app_backup).
//   pnpm backup:reapply --since <iso> (--source | --ledger <arquivo> | --no-source)
//                                              só a reaplicação, num banco restaurado pelo provedor
//                                              (RESTORE_MIGRATION_DATABASE_URL e RESTORE_WORKER_DATABASE_URL)
//   pnpm backup:drop <nome>_restore            destrói o banco isolado
// create/restore/drop usam o Postgres do docker compose (dev, CI e ensaio de restauração). Nunca imprime
// credenciais, chaves, conteúdo de linha nem ids de pessoas: só nomes de tabela, contagens e resultados (a saída
// das ferramentas do Postgres só vai para BACKUP_DEBUG_LOG, se definida).
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { appendFile, chmod, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import pg from 'pg';
import { createDbClient } from '@/lib/db/client';
import {
  BackupFormatError,
  createBackupEncryptStream,
  decryptBackupFile,
  parseBackupKey,
  readBackupFile,
  verifyBackupFile,
  type BackupManifest,
} from '@/lib/backup/container';
import { createLogger } from '@/lib/logger';
import { HEALTH_DATA_ERASERS } from '@/modules/health/erasers';
import {
  createRestoreReapplier,
  LEDGER_MARGIN_MS,
  readRestoreLedger,
  restoreLedgerSchema,
  type RestoreLedger,
} from '@/modules/privacy/restore';
import { assertLocalDatabase } from '../tests/db/safety';

const out = (line: string) => process.stdout.write(`${line}\n`);
class UsageError extends Error {}
/** Falha com mensagem própria do script (sem dado de linha): impressa inteira. */
class OpError extends Error {}

const args = process.argv.slice(2);
const command = args[0] ?? '';
const flag = (name: string) => args.includes(name);
function option(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const BACKUP_DIR = process.env.BACKUP_DIR || '.backups';
const SUPERUSER = process.env.POSTGRES_SUPERUSER || 'postgres';
const DB_NAME = /^[a-z0-9_]{1,63}$/;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new UsageError(`${name} não está definida.`);
  return value;
}

function key(): Buffer {
  const k = parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY);
  // Chave própria: nunca a mesma da criptografia de campo nem de outro segredo.
  for (const other of [
    'KMS_LOCAL_MASTER_KEY',
    'SESSION_SECRET',
    'RATE_LIMIT_SECRET',
    'RECOVERY_CODE_PEPPER',
  ]) {
    if (process.env[other] && Buffer.from(process.env[other] ?? '', 'base64').equals(k)) {
      throw new UsageError(`BACKUP_ENCRYPTION_KEY não pode ser igual a ${other}.`);
    }
  }
  return k;
}

function dbName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

function withDb(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

/** Banco isolado de restauração: nome terminado em `_restore`, nunca o da aplicação nem o de testes. */
function assertRestoreTarget(name: string): void {
  const protectedNames = [
    process.env.APP_DB_NAME || 'healthmind',
    process.env.APP_TEST_DB_NAME || 'healthmind_test',
  ];
  if (!DB_NAME.test(name) || !name.endsWith('_restore') || protectedNames.includes(name)) {
    throw new UsageError(`Banco de restauração inválido: ${name} (precisa terminar em _restore).`);
  }
}

/**
 * Saída completa de pg_dump/pg_restore/psql/Prisma (revisão M2 da 7e): pode citar valores de linha (`DETAIL: Key
 * (email)=...`, `CONTEXT: COPY ...`), então nunca vai para o terminal nem para o log da CI. Só para um arquivo
 * local de quem opera, se `BACKUP_DEBUG_LOG` estiver definida.
 */
async function debugLog(text: string): Promise<string> {
  const name = process.env.BACKUP_DEBUG_LOG;
  if (!name || !text.trim()) return ' (defina BACKUP_DEBUG_LOG=<nome> para guardar os detalhes)';
  // Segunda revisão, N3: só dentro de BACKUP_DIR (ignorado pelo git), nunca num caminho qualquer.
  if (!/^[a-z0-9_-]{1,64}\.log$/i.test(name))
    return ' (BACKUP_DEBUG_LOG precisa ser um nome como erro.log)';
  const file = path.join(BACKUP_DIR, name);
  await mkdir(BACKUP_DIR, { recursive: true });
  await appendFile(file, `${new Date().toISOString()}\n${text}\n`, { mode: 0o600 });
  return ` (detalhes em ${file})`;
}

/** Comando dentro do contêiner `db` do docker compose (pg_dump, pg_restore e psql da mesma versão do servidor). */
function docker(
  cmd: string[],
  io: { stdin?: NodeJS.ReadableStream; stdout?: NodeJS.WritableStream } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['compose', 'exec', '-T', 'db', ...cmd], {
      stdio: [io.stdin ? 'pipe' : 'ignore', io.stdout ? 'pipe' : 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });
    if (io.stdin && child.stdin) io.stdin.pipe(child.stdin);
    if (io.stdout && child.stdout) child.stdout.pipe(io.stdout);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      void debugLog(stderr).then(
        (where) => reject(new OpError(`${cmd[0]} saiu com código ${code}${where}`)),
        () => reject(new OpError(`${cmd[0]} saiu com código ${code}`)),
      );
    });
  });
}

const psql = (database: string, sql: string) =>
  docker(['psql', '-v', 'ON_ERROR_STOP=1', '-q', '-U', SUPERUSER, '-d', database, '-c', sql]);

/** Tabelas de `public` e `app` com a contagem de linhas (só números). */
async function countTables(client: pg.Client): Promise<Record<string, number>> {
  const { rows } = await client.query<{ nspname: string; relname: string }>(
    `SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'app') AND c.relkind IN ('r', 'p') ORDER BY 1, 2`,
  );
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const { rows: n } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${pg.escapeIdentifier(r.nspname)}.${pg.escapeIdentifier(r.relname)}`,
    );
    counts[r.nspname === 'public' ? r.relname : `${r.nspname}.${r.relname}`] = n[0]?.n ?? 0;
  }
  return counts;
}

async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

async function writeEncrypted(
  file: string,
  manifest: BackupManifest,
  feed: (sink: NodeJS.WritableStream) => Promise<void>,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const part = `${file}.part`;
  const encrypt = createBackupEncryptStream(key(), manifest);
  const written = pipeline(encrypt, createWriteStream(part, { mode: 0o600 }));
  try {
    await feed(encrypt);
    await written;
    await chmod(part, 0o600);
    await rename(part, file);
  } catch (error) {
    encrypt.destroy();
    await written.catch(() => {});
    await rm(part, { force: true });
    throw error;
  }
}

const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

// ---------- create ----------
async function create(): Promise<void> {
  const url = env('MIGRATION_DATABASE_URL');
  // As contagens vêm desta conexão e o dump do contêiner local: os dois precisam ser o mesmo servidor (B4).
  assertLocalDatabase(url);
  const client = await connect(url);
  try {
    // Contagens e dump no MESMO snapshot: o pg_dump importa o snapshot desta transação.
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows } = await client.query<{ snap: string; at: Date; db: string }>(
      // statement_timestamp(): o snapshot é tirado no início deste comando, então tudo o que ele vê é anterior.
      'SELECT pg_export_snapshot() AS snap, statement_timestamp() AS at, current_database() AS db',
    );
    const head = rows[0];
    if (!head) throw new Error('snapshot');
    const { rows: mig } = await client.query<{ name: string }>(
      `SELECT migration_name AS name FROM public._prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY 1`,
    );
    const manifest: BackupManifest = {
      kind: 'database',
      version: 1,
      takenAt: head.at.toISOString(),
      database: head.db,
      migrations: mig.map((m) => m.name),
      counts: await countTables(client),
    };
    const file =
      option('--out') ?? path.join(BACKUP_DIR, `${head.db}-${stamp(manifest.takenAt)}.hmbk`);
    await writeEncrypted(file, manifest, (sink) =>
      docker(['pg_dump', '-U', SUPERUSER, '-d', head.db, '-Fc', `--snapshot=${head.snap}`], {
        stdout: sink,
      }),
    );
    const total = Object.values(manifest.counts).reduce((a, b) => a + b, 0);
    out(`Backup cifrado: ${file}`);
    out(
      `Ponto do backup: ${manifest.takenAt} · ${Object.keys(manifest.counts).length} tabelas · ${total} linhas`,
    );
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
  }
}

// ---------- ledger ----------
async function ledger(): Promise<void> {
  // Papel app_backup: só executa app.restore_ledger (revisão M3), nunca o dono.
  const url = env('BACKUP_DATABASE_URL');
  const days = Number(process.env.BACKUP_RETENTION_DAYS || 30);
  const since = new Date(option('--since') ?? Date.now() - days * 24 * 60 * 60 * 1000);
  if (Number.isNaN(since.getTime())) throw new UsageError('--since inválido (use ISO 8601).');
  const client = await connect(url);
  try {
    const book = await readRestoreLedger(client, since);
    const manifest: BackupManifest = {
      kind: 'ledger',
      version: 1,
      takenAt: new Date(book.readAt).toISOString(),
      database: dbName(url),
    };
    const file =
      option('--out') ??
      path.join(BACKUP_DIR, `${manifest.database}-livro-${stamp(manifest.takenAt)}.hmbk`);
    await writeEncrypted(file, manifest, async (sink) => {
      sink.end(Buffer.from(JSON.stringify(book), 'utf8'));
    });
    out(`Livro cifrado: ${file}`);
    out(`Mudanças desde ${since.toISOString()}, lidas em ${manifest.takenAt}`);
  } finally {
    await client.end().catch(() => {});
  }
}

// ---------- reaplicação ----------
async function loadLedger(since: Date): Promise<RestoreLedger | null> {
  const choices = [flag('--source'), Boolean(option('--ledger')), flag('--no-source')].filter(
    Boolean,
  );
  if (choices.length !== 1) {
    throw new UsageError('Escolha uma origem: --source, --ledger <arquivo> ou --no-source.');
  }
  if (flag('--no-source')) {
    out(
      'AVISO: sem origem, o que mudou depois do backup NÃO é reaplicado (BACKUP_RESTORE.md, residual).',
    );
    return null;
  }
  const file = option('--ledger');
  if (file) {
    const { manifest, body } = await readBackupFile(file, key());
    if (manifest.kind !== 'ledger')
      throw new UsageError('O arquivo não é um livro de reaplicação.');
    const book = restoreLedgerSchema.parse(JSON.parse(body.toString('utf8')));
    if (new Date(book.since).getTime() > since.getTime() - LEDGER_MARGIN_MS) {
      throw new UsageError(
        'O livro começa depois do ponto do backup (menos 1 hora): não cobre todas as mudanças.',
      );
    }
    // Revisão A1: um livro lido antes do backup faria parecer excluídas as contas criadas depois dele.
    if (new Date(book.readAt).getTime() < since.getTime()) {
      throw new UsageError('O livro foi lido antes do ponto do backup: use um livro mais recente.');
    }
    out(`AVISO: o livro foi lido em ${book.readAt}; mudanças depois disso não são reaplicadas.`);
    return book;
  }
  const source = await connect(env('BACKUP_DATABASE_URL'));
  try {
    return await readRestoreLedger(source, since);
  } finally {
    await source.end().catch(() => {});
  }
}

async function reapplyOn(migratorUrl: string, workerUrl: string, since: Date): Promise<void> {
  const book = await loadLedger(since);
  const owner = await connect(migratorUrl);
  const worker = createDbClient(workerUrl);
  try {
    const reapplier = createRestoreReapplier({
      owner,
      worker,
      erasers: HEALTH_DATA_ERASERS,
      logger: createLogger({ sink: () => {} }),
    });
    // Plano antes de mudar qualquer coisa (revisão A2): o banco já recusou livro de outra instalação ou antigo.
    if (book) {
      const plan = await reapplier.plan(book, since);
      const total = plan.closures + plan.unverified;
      out(
        `Plano: ${plan.closures} contas a encerrar, ${plan.unverified} não verificadas a remover, ` +
          `${plan.health} eliminações de saúde, de ${plan.users} contas restauradas.`,
      );
      if (flag('--dry-run')) {
        out('Simulação (--dry-run): nada foi reaplicado.');
        return;
      }
      const limit = Math.max(5, Math.ceil(plan.users * 0.01));
      if (total > limit && option('--confirm-closures') !== String(total)) {
        throw new UsageError(
          `Remoções acima do limite (${total} > ${limit}). Confira a origem e, se estiver certo, ` +
            `rode de novo com --confirm-closures ${total}.`,
        );
      }
    } else if (flag('--dry-run')) {
      out('Simulação (--dry-run): sem origem, só os acessos seriam zerados.');
      return;
    }
    const summary = await reapplier.reapply(book, since);
    if (summary.failed > 0) {
      throw new OpError(
        `${summary.failed} purgas não concluíram: rode a reaplicação de novo (pnpm backup:reapply).`,
      );
    }
    out(
      `Reaplicado: ${summary.accountsPurged} contas purgadas, ${summary.unverifiedRemoved} não verificadas ` +
        `removidas, ${summary.healthEliminated} eliminações de saúde, ${summary.proofsCopied} provas copiadas, ` +
        `${summary.sessionsRevoked} sessões revogadas, ${summary.exportsExpired} exportações vencidas.`,
    );
  } finally {
    await owner.end().catch(() => {});
    await worker.$disconnect();
  }
}

/** Roda um script Node do projeto com as URLs apontadas para o banco restaurado (sem shell). */
function run(
  script: string,
  scriptArgs: string[],
  extraEnv: Record<string, string>,
): Promise<void> {
  const cmd = process.execPath;
  const cmdArgs = [script, ...scriptArgs];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (d: Buffer) => (output += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (output += d.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      // Do verify-db-roles, só as linhas de checagem (nomes fixos); o resto (Prisma) só no arquivo local.
      for (const line of output.split(/\r?\n/)) if (/^(ok {2}|FAIL) /.test(line)) out(line);
      void debugLog(output).then(
        (where) => reject(new OpError(`${path.basename(script)} falhou (código ${code})${where}`)),
        () => reject(new OpError(`${path.basename(script)} falhou (código ${code})`)),
      );
    });
  });
}

// ---------- restore ----------
async function restore(): Promise<void> {
  const file = args[1];
  if (!file || file.startsWith('--')) throw new UsageError('Informe o arquivo do backup.');
  const k = key();
  // 1) Etiqueta conferida no arquivo inteiro antes de qualquer byte decifrado chegar ao banco.
  const manifest = await verifyBackupFile(file, k);
  if (manifest.kind !== 'database') throw new UsageError('O arquivo não é um backup do banco.');
  const target = option('--target') ?? `${manifest.database}_restore`;
  assertRestoreTarget(target);
  assertLocalDatabase(env('MIGRATION_DATABASE_URL'));
  const migratorUrl = withDb(env('MIGRATION_DATABASE_URL'), target);
  const workerUrl = withDb(env('WORKER_DATABASE_URL'), target);
  const since = new Date(manifest.takenAt);
  out(
    `Backup de ${manifest.database}, ponto ${manifest.takenAt}. Restaurando em ${target} (isolado).`,
  );

  // 2) Banco isolado, com os mesmos donos e acessos do banco da aplicação (docker/postgres/init).
  await psql('postgres', `DROP DATABASE IF EXISTS ${target} WITH (FORCE)`);
  await psql('postgres', `CREATE DATABASE ${target} OWNER app_migrator`);
  await psql(
    'postgres',
    `REVOKE ALL ON DATABASE ${target} FROM PUBLIC;
     GRANT CONNECT, TEMPORARY ON DATABASE ${target} TO app_user, app_worker;
     GRANT CONNECT ON DATABASE ${target} TO app_backup;
     DO $$ DECLARE r record; BEGIN
       FOR r IN SELECT m.member::regrole::text AS name FROM pg_auth_members m
                 WHERE m.roleid = 'app_operator'::regrole LOOP
         EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', '${target}', r.name);
       END LOOP; END $$;`,
  );

  try {
    await restoreAndCheck(file, k, manifest, target, migratorUrl, workerUrl);
  } catch (error) {
    // Nada pela metade fica para trás (inclusive se a etiqueta falhar na segunda passada).
    await psql('postgres', `DROP DATABASE IF EXISTS ${target} WITH (FORCE)`).catch(() => {});
    throw error;
  }

  // 6) Reaplicação (P7-M3), antes de qualquer acesso. Se falhar, o banco fica para `backup:reapply`.
  await reapplyOn(migratorUrl, workerUrl, since);
  if (flag('--dry-run')) return;
  out(`Pronto. Banco restaurado: ${target}. Destrua depois do ensaio: pnpm backup:drop ${target}`);
}

async function restoreAndCheck(
  file: string,
  k: Buffer,
  manifest: Extract<BackupManifest, { kind: 'database' }>,
  target: string,
  migratorUrl: string,
  workerUrl: string,
): Promise<void> {
  // 3) Restauração: o conteúdo decifrado vai direto ao pg_restore pelo pipe (nunca em claro no disco).
  let restoring: Promise<void> | undefined;
  try {
    await decryptBackupFile(file, k, () => {
      const pass = new PassThrough();
      restoring = docker(['pg_restore', '-U', SUPERUSER, '-d', target, '--exit-on-error'], {
        stdin: pass,
      });
      return pass;
    });
  } catch (error) {
    await restoring?.catch(() => {});
    throw error;
  }
  await restoring;

  // 4) Contagens do snapshot, antes de qualquer migração ou reaplicação.
  const check = await connect(migratorUrl);
  try {
    const counts = await countTables(check);
    const wrong = Object.keys(manifest.counts).filter((t) => counts[t] !== manifest.counts[t]);
    if (wrong.length > 0) {
      throw new OpError(`Contagens diferentes do backup em: ${wrong.join(', ')}`);
    }
    out(`Contagens conferidas: ${Object.keys(manifest.counts).length} tabelas iguais ao backup.`);
  } finally {
    await check.end().catch(() => {});
  }

  // 5) Migrações pendentes (backup antigo) e papéis.
  const restoredEnv = {
    MIGRATION_DATABASE_URL: migratorUrl,
    DATABASE_URL: withDb(env('DATABASE_URL'), target),
    WORKER_DATABASE_URL: workerUrl,
    ...(process.env.OPERATOR_DATABASE_URL
      ? { OPERATOR_DATABASE_URL: withDb(process.env.OPERATOR_DATABASE_URL, target) }
      : {}),
  };
  await run(
    path.join('node_modules', 'prisma', 'build', 'index.js'),
    ['migrate', 'deploy'],
    restoredEnv,
  );
  await run('scripts/verify-db-roles.mjs', [], restoredEnv);
  out('Migrações aplicadas e papéis conferidos (db:verify-roles).');
}

// ---------- reapply (banco restaurado pelo provedor) ----------
async function reapply(): Promise<void> {
  const since = new Date(option('--since') ?? '');
  if (Number.isNaN(since.getTime())) {
    throw new UsageError('Informe --since com o ponto do backup restaurado (ISO 8601).');
  }
  const migratorUrl = env('RESTORE_MIGRATION_DATABASE_URL');
  const workerUrl = env('RESTORE_WORKER_DATABASE_URL');
  if (dbName(migratorUrl) !== dbName(workerUrl)) {
    throw new UsageError(
      'RESTORE_MIGRATION_DATABASE_URL e RESTORE_WORKER_DATABASE_URL apontam para bancos diferentes.',
    );
  }
  if (
    new URL(migratorUrl).host === new URL(env('MIGRATION_DATABASE_URL')).host &&
    dbName(migratorUrl) === dbName(env('MIGRATION_DATABASE_URL'))
  ) {
    throw new UsageError('O banco restaurado não pode ser a própria origem.');
  }
  await reapplyOn(migratorUrl, workerUrl, since);
}

// ---------- drop ----------
async function drop(): Promise<void> {
  const target = args[1] ?? '';
  assertRestoreTarget(target);
  assertLocalDatabase(env('MIGRATION_DATABASE_URL'));
  await psql('postgres', `DROP DATABASE IF EXISTS ${target} WITH (FORCE)`);
  out(`Banco ${target} destruído.`);
}

async function main(): Promise<void> {
  if (process.env.APP_ENV === 'production' && ['create', 'restore', 'drop'].includes(command)) {
    throw new UsageError(
      'create/restore/drop usam o Postgres local do docker compose; em produção, use o runbook.',
    );
  }
  const commands: Record<string, () => Promise<void>> = { create, ledger, restore, reapply, drop };
  const fn = commands[command];
  if (!fn)
    throw new UsageError('Comando desconhecido. Use: create | ledger | restore | reapply | drop.');
  await fn();
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  // Só mensagens próprias saem inteiras; erros do pg e outros, só com código ou nome (podem citar valores).
  const code = (error as { code?: unknown })?.code;
  const text =
    error instanceof OpError || error instanceof BackupFormatError
      ? error.message
      : typeof code === 'string'
        ? `código ${code}`
        : error instanceof Error
          ? error.name
          : 'erro';
  process.stderr.write(`Falha: ${text}\n`);
  process.exitCode = 1;
});
