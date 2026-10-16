import { randomBytes } from 'node:crypto';
import 'dotenv/config';
import pg from 'pg';
import { NoAgeSignalProvider } from '@/adapters/age-signal/none';
import type { AgeSignalProvider } from '@/adapters/age-signal/types';
import { LocalKmsProvider } from '@/adapters/kms/local';
import { ConsoleMailProvider } from '@/adapters/mail/console';
import { createDbClient, type Db } from '@/lib/db/client';
import { createLogger, type LogRecord } from '@/lib/logger';
import { createAuthService, type AuthService } from '@/modules/auth/service';
import { stableTestClock } from '../support/clock';
import { assertDisposableDatabase } from './safety';

/** Tabelas do schema public (exceto controle de migrações), para limpeza e contagem. */
export async function publicTables(admin: pg.Client): Promise<string[]> {
  const { rows } = await admin.query<{ relname: string }>(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
      ORDER BY 1`,
  );
  return rows.map((r) => r.relname);
}

/** Conexão administrativa (app_migrator, dono das tabelas): só para preparar e inspecionar o banco. */
export async function connectAdmin(): Promise<pg.Client> {
  const admin = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await admin.connect();
  return admin;
}

/** Dados de referência semeados pelas migrações (sem dado pessoal): não são apagados entre testes. */
export const REFERENCE_TABLES = new Set(['policy_versions']);

export async function truncateAll(admin: pg.Client): Promise<void> {
  assertDisposableDatabase(process.env.MIGRATION_DATABASE_URL);
  const tables = (await publicTables(admin)).filter((t) => !REFERENCE_TABLES.has(t));
  await admin.query(`TRUNCATE ${tables.map((t) => `public."${t}"`).join(', ')} CASCADE`);
}

export async function rowCounts(admin: pg.Client): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of await publicTables(admin)) {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public."${t}"`,
    );
    out[t] = rows[0]?.n ?? -1;
  }
  return out;
}

/** Client do runtime: app_user, sujeito ao RLS. */
export function runtimeDb(): Db {
  return createDbClient(process.env.DATABASE_URL ?? '');
}

/**
 * Client dos jobs: app_worker (ADR-0037), o único que executa varreduras, expurgos, a fila e a purga. Um por
 * processo de teste (as suítes que varrem compartilham).
 */
let worker: Db | undefined;
export function workerDb(): Db {
  worker ??= createDbClient(process.env.WORKER_DATABASE_URL ?? '');
  return worker;
}

export interface TestAuth {
  service: AuthService;
  mail: ConsoleMailProvider;
  logs: LogRecord[];
  clock: { now: Date };
  sessionSecret: Uint8Array;
  rateLimitSecret: Uint8Array;
  recoveryPepper: Uint8Array;
}

export function createTestAuth(
  db: Db,
  opts: {
    ageSignal?: AgeSignalProvider;
    /** Atraso artificial do envio de e-mail (simula provedor real). */
    mailDelayMs?: number;
    /** Coleta tarefas adiadas em vez de rodar em linha (como o `after()` do Next). */
    deferred?: Array<Promise<void>>;
    /** Pepper dos códigos de recuperação (padrão: aleatório). */
    recoveryPepper?: Uint8Array;
  } = {},
): TestAuth {
  const logs: LogRecord[] = [];
  const logger = createLogger({ minLevel: 'debug', sink: (r) => logs.push(r) });
  const mail = new ConsoleMailProvider({ logger, keepOutbox: true });
  if (opts.mailDelayMs) {
    const send = mail.send.bind(mail);
    const delay = opts.mailDelayMs;
    mail.send = async (m) => {
      await new Promise((r) => setTimeout(r, delay));
      return send(m);
    };
  }
  // Longe da virada da hora: janelas fixas de 1 h não zeram no meio do teste (PR1a-R3-B5).
  const clock = { now: stableTestClock() };
  const sessionSecret = randomBytes(32);
  const rateLimitSecret = randomBytes(32);
  const recoveryPepper = opts.recoveryPepper ?? randomBytes(32);
  const service = createAuthService({
    db,
    workerDb,
    kms: new LocalKmsProvider(randomBytes(32).toString('base64')),
    mail,
    ageSignal: opts.ageSignal ?? new NoAgeSignalProvider(),
    logger,
    sessionSecret,
    rateLimitSecret,
    recoveryPepper,
    appUrl: 'http://localhost:3000',
    now: () => clock.now,
    ...(opts.deferred
      ? { defer: (task: () => Promise<void>) => void opts.deferred?.push(task()) }
      : {}),
  });
  return { service, mail, logs, clock, sessionSecret, rateLimitSecret, recoveryPepper };
}

export const META = { ip: '203.0.113.10', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0' };
export const PASSWORD = 'cavalo bateria grampo correto';

/** Token do último e-mail para `to` com o template dado. */
export function lastMailToken(t: TestAuth, to: string, template: string): string {
  const msg = [...t.mail.outbox].reverse().find((m) => m.to === to && m.template === template);
  const url = msg?.params.url;
  if (!url) throw new Error(`nenhum e-mail ${template}`);
  // Token no fragmento (TM-01).
  return new URLSearchParams(new URL(url).hash.slice(1)).get('token') ?? '';
}

let counter = 0;
export function uniqueEmail(prefix = 'pessoa'): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@exemplo.test`;
}

/** Cria conta adulta, verifica o e-mail e devolve o id. Dados 100% sintéticos. */
export async function createVerifiedUser(
  t: TestAuth,
  email = uniqueEmail(),
  meta = { ...META, ip: `198.51.100.${(counter % 250) + 1}` },
): Promise<{ email: string; userId: string; token: string }> {
  const age = await t.service.checkAge('1990-05-20', new Headers());
  if (age.outcome !== 'adult') throw new Error('age gate');
  const reg = await t.service.register(
    { email, password: PASSWORD, ageOkCookie: age.cookie },
    meta,
  );
  if (!reg.ok) throw new Error(`registro: ${reg.error}`);
  const verified = await t.service.verifyEmail(lastMailToken(t, email, 'email-verification'));
  if (!verified) throw new Error('verificação');
  const login = await t.service.login({ email, password: PASSWORD }, meta);
  if (!login.ok) throw new Error('login');
  const s = await t.service.resolveSession(login.token);
  if (!s) throw new Error('sessão');
  return { email, userId: s.userId, token: login.token };
}
