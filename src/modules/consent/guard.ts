import type { Db } from '@/lib/db/client';
import { withUserOn, type Tx } from '@/lib/db/rls';
import { ConsentRequiredError } from '@/lib/errors';
import type { ConsentPurpose } from './catalog';

/**
 * Guard de tratamento (CLAUDE.md regra 1; LEG-C04). Todo tratamento de dado que dependa de
 * consentimento passa por aqui, NA MESMA TRANSAÇÃO do acesso: revogar vale para a próxima operação.
 * A partir da Fase 2, as políticas RLS das tabelas de saúde repetem a checagem no banco
 * (`app.has_active_consent('health_data')`), então um esquecimento na aplicação também falha fechado.
 */
export async function hasActiveConsent(tx: Tx, purpose: ConsentPurpose): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ active: boolean }>>`
    SELECT app.has_active_consent(${purpose}::public.consent_purpose) AS active`;
  return rows[0]?.active === true;
}

export async function assertConsent(tx: Tx, purpose: ConsentPurpose): Promise<void> {
  if (!(await hasActiveConsent(tx, purpose))) throw new ConsentRequiredError(purpose);
}

/** `withUser` + checagem de consentimento no início da transação. */
export function withConsentOn<T>(
  db: Db,
  userId: string,
  purpose: ConsentPurpose,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withUserOn(db, userId, async (tx) => {
    await assertConsent(tx, purpose);
    return fn(tx);
  });
}
