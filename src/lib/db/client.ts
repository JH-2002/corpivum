import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getEnv } from '@/lib/env';

/**
 * Client Prisma do runtime: conecta como `app_user` (LEG-S03; `parseEnv` recusa app_migrator/postgres).
 * Uso direto só em `src/lib/db` e no módulo `auth` (funções SECURITY DEFINER do pré-login). Todo o resto
 * acessa dados por `withUser`/`forUser`, que fixam `app.user_id` na transação. Regra no ESLint.
 */
export type Db = PrismaClient;

export function createDbClient(connectionString: string): Db {
  // `minimal`: mensagens de erro sem eco dos argumentos (hashes, e-mail). LEG-R04.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }), errorFormat: 'minimal' });
}

const globalForDb = globalThis as unknown as { __hmDb?: Db; __hmWorkerDb?: Db };

export function getDb(): Db {
  globalForDb.__hmDb ??= createDbClient(getEnv().DATABASE_URL);
  return globalForDb.__hmDb;
}

/**
 * Client dos jobs em segundo plano: `app_worker` (ADR-0036 D5, ADR-0037), o único papel que executa as
 * varreduras, os expurgos, a fila e a purga de conta. Herda as tabelas do `app_user` (mesmo RLS). Criado só
 * quando um job roda: instâncias web com JOB_WORKER=off não têm a credencial.
 */
export function getWorkerDb(): Db {
  const url = getEnv().WORKER_DATABASE_URL;
  if (!url) throw new Error('WORKER_DATABASE_URL não definida: esta instância não consome a fila');
  globalForDb.__hmWorkerDb ??= createDbClient(url);
  return globalForDb.__hmWorkerDb;
}
