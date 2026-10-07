import { auditAppend } from '@/lib/db/audit';
import type { Db } from '@/lib/db/client';
import { withUserOn, type Tx } from '@/lib/db/rls';
import type { Logger } from '@/lib/logger';
import { hasActiveConsent } from '@/modules/consent/guard';

/**
 * Eliminação dos dados de saúde após a revogação do consentimento (ADR-0019, LEGAL-REVIEW).
 *
 * Cada módulo com dados de saúde (Fase 2 em diante) registra um eliminador que apaga as PRÓPRIAS linhas do
 * usuário da transação (RLS por dono no DELETE, sem exigir consentimento). Na Fase 1b ainda não há tabela de
 * saúde: o registro começa vazio. Regra para módulos novos: registrar o eliminador e testá-lo.
 */
export type HealthDataEraser = (tx: Tx) => Promise<number>;

const erasers = new Map<string, HealthDataEraser>();

export function registerHealthDataEraser(module: string, eraser: HealthDataEraser): () => void {
  erasers.set(module, eraser);
  return () => erasers.delete(module);
}

export function registeredHealthDataErasers(): readonly string[] {
  return [...erasers.keys()];
}

export type EliminationOutcome = 'eliminated' | 'skipped';

export function createHealthDataEliminator(deps: { db: Db; logger: Logger; now?: () => Date }) {
  const now = deps.now ?? (() => new Date());
  return {
    /**
     * Elimina se, NA HORA da execução, a eliminação ainda estiver agendada e vencida e não houver
     * consentimento ativo. Reconsentir antes do prazo zera o agendamento: o job vira no-op.
     */
    async eliminate(userId: string): Promise<EliminationOutcome> {
      const outcome = await withUserOn(deps.db, userId, async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { healthDataPurgeAt: true },
        });
        if (!user?.healthDataPurgeAt || user.healthDataPurgeAt > now()) return 'skipped';
        if (await hasActiveConsent(tx, 'health_data')) return 'skipped';
        let rows = 0;
        for (const eraser of erasers.values()) rows += await eraser(tx);
        await tx.user.update({ where: { id: userId }, data: { healthDataPurgeAt: null } });
        await auditAppend(tx, 'health_data_eliminated', 'health_data', null, { system: true });
        deps.logger.info('privacy.health_data_eliminated', { userId, count: rows });
        return 'eliminated';
      });
      return outcome;
    },
  };
}
