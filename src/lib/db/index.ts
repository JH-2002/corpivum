import 'server-only';
import { getDb } from './client';
import { forUserOn, withUserOn, type Tx } from './rls';

export type { Tx };

/** Transação com `app.user_id` fixado (LEG-S03). Forma padrão de acessar dados de usuário. */
export function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withUserOn(getDb(), userId, fn);
}

/** Client em que cada operação roda com `app.user_id` fixado (LEG-S03). */
export function forUser(userId: string) {
  return forUserOn(getDb(), userId);
}
