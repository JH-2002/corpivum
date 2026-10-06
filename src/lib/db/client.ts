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
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForDb = globalThis as unknown as { __hmDb?: Db };

export function getDb(): Db {
  globalForDb.__hmDb ??= createDbClient(getEnv().DATABASE_URL);
  return globalForDb.__hmDb;
}
