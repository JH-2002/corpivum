import { auditAppend } from '@/lib/db/audit';
import type { Db } from '@/lib/db/client';
import { withUserOn, type Tx } from '@/lib/db/rls';
import type { Logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { hasActiveConsent } from '@/modules/consent/guard';

/**
 * Eliminação dos dados de saúde após a revogação do consentimento (ADR-0019, LEGAL-REVIEW).
 *
 * Cada eliminador apaga as PRÓPRIAS linhas do usuário da transação (RLS por dono no DELETE, sem exigir
 * consentimento). Os eliminadores são INJETADOS (lista de produção: `@/modules/health/erasers`), não
 * registrados num estado global: um processo que esquecesse o registro "eliminaria" zero tabelas e daria a
 * eliminação como feita (revisão da Fase 2, M1). Lista vazia = erro, nada é limpo.
 */
export type HealthDataEraser = (tx: Tx) => Promise<number>;
export type HealthDataErasers = Readonly<Record<string, HealthDataEraser>>;
/** Dado de saúde FORA do banco (arquivos de exportação no storage, ADR-0032), apagado depois das tabelas. */
export type ObjectEraser = (userId: string) => Promise<void>;

export type EliminationOutcome = 'eliminated' | 'skipped';

export function createHealthDataEliminator(deps: {
  db: Db;
  logger: Logger;
  erasers: HealthDataErasers;
  eraseObjects: ObjectEraser;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  const erasers = Object.values(deps.erasers);
  if (erasers.length === 0) throw new AppError('VALIDATION', 'nenhum eliminador de dados de saúde');
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
        // Arquivos fora do banco primeiro, ainda na transação (revisão A1 da 6a): se o storage falhar, nada é
        // confirmado e o job tenta de novo; se as tabelas falharem depois, o arquivo já sumiu e o download dá 404.
        await deps.eraseObjects(userId);
        let rows = 0;
        for (const eraser of erasers) rows += await eraser(tx);
        await tx.user.update({ where: { id: userId }, data: { healthDataPurgeAt: null } });
        await auditAppend(tx, 'health_data_eliminated', 'health_data', null, { system: true });
        // Sem userId: o log não liga uma conta à revogação de dados de saúde (B5).
        deps.logger.info('privacy.health_data_eliminated', { count: rows });
        return 'eliminated';
      });
      return outcome;
    },
  };
}
