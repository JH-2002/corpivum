import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { AppError } from '@/lib/errors';
import type { Db } from './client';

/** Cliente de transação recebido por `withUser`. */
export type Tx = Prisma.TransactionClient;

const userIdSchema = z.uuid();

function assertUserId(userId: string): string {
  const parsed = userIdSchema.safeParse(userId);
  if (!parsed.success) throw new AppError('VALIDATION', 'userId inválido para contexto RLS');
  return parsed.data;
}

/**
 * Executa `fn` numa transação com `app.user_id` fixado (LEG-S03). `set_config(..., true)` é o equivalente
 * parametrizado de `SET LOCAL`: vale só até o fim da transação, então não vaza entre conexões do pool.
 */
export async function withUserOn<T>(
  db: Db,
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const id = assertUserId(userId);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.user_id', ${id}, true)`;
    return fn(tx);
  });
}

/**
 * Client estendido em que CADA operação de modelo roda em transação própria com `app.user_id` fixado.
 * Para várias operações atômicas, prefira `withUser`.
 */
export function forUserOn(db: Db, userId: string) {
  const id = assertUserId(userId);
  return db.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await db.$transaction([
            db.$queryRaw`SELECT set_config('app.user_id', ${id}, true)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}
