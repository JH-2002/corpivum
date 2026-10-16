import type { Alert, ErrorReporter } from '@/adapters/error-reporter/types';
import type { Db } from '@/lib/db/client';
import { logger as defaultLogger, type Logger } from '@/lib/logger';

/**
 * Alerta de volume anômalo (P7-M1, 7b-R3, ADR-0038). O RLS não protege contra código que já executa como o
 * runtime (P7-M1): ele declara qualquer `app.user_id` e lê os dados de muitas contas. O sinal vem dos contadores
 * do Postgres (`app.security_volume_sample`, só no `app_worker`), que o runtime não altera: tuplas lidas nas tabelas
 * de saúde, em `users` e em `consent_records` num período de relógio de cerca de 1 hora, comparadas com a mediana
 * por hora dos 7 dias anteriores. Nada que o runtime grava (ex.: `sessions.last_seen_at`) entra no teto (revisão A1
 * da 7c). E, do AuditLog, o maior número de ações de um mesmo papel de operador (7b-R3).
 *
 * Os números são a calibração inicial (sem tráfego real): ajustar com a operação (CHECKLIST_GO_LIVE). O alerta leva
 * só contagem e teto; quem e o quê se apura no banco, pelo runbook (docs/runbooks/ALERTS.md).
 */
export interface VolumeLimits {
  /** Teto mínimo de leitura por hora (vale também enquanto não há 24 horas de histórico). */
  readFloorPerHour: number;
  /** Quantas vezes a mediana por hora dos 7 dias anteriores o período pode ler. */
  readBaselineMultiplier: number;
  /** Ações de um mesmo papel de operador por hora (o teto do contato é 30/h; atendimento real é bem menor). */
  operatorActionsPerHour: number;
}

export const VOLUME_LIMITS: Readonly<VolumeLimits> = {
  readFloorPerHour: 100_000,
  readBaselineMultiplier: 5,
  operatorActionsPerHour: 20,
};

export interface VolumeSample {
  tuplesRead: number;
  windowMinutes: number;
  /** Mediana das leituras por hora nos 7 dias anteriores; `null` com menos de 24 horas de histórico. */
  baselinePerHour: number | null;
  operatorActionsMax: number;
}

export interface VolumeEvaluation {
  read: { count: number; threshold: number; anomalous: boolean };
  operator: { count: number; threshold: number; anomalous: boolean };
}

/** Pura: tetos proporcionais à duração do período (o job pode atrasar). */
export function evaluateVolume(
  sample: VolumeSample,
  limits: Readonly<VolumeLimits> = VOLUME_LIMITS,
): VolumeEvaluation {
  const hours = Math.max(sample.windowMinutes, 1) / 60;
  const perHour = Math.max(
    limits.readFloorPerHour,
    limits.readBaselineMultiplier * (sample.baselinePerHour ?? 0),
  );
  const readThreshold = Math.round(perHour * hours);
  const operatorThreshold = Math.max(1, Math.round(limits.operatorActionsPerHour * hours));
  return {
    read: {
      count: sample.tuplesRead,
      threshold: readThreshold,
      anomalous: sample.tuplesRead > readThreshold,
    },
    operator: {
      count: sample.operatorActionsMax,
      threshold: operatorThreshold,
      anomalous: sample.operatorActionsMax > operatorThreshold,
    },
  };
}

export interface VolumeMonitor {
  /** Amostra, avalia e alerta. `null` sem amostra de pelo menos 55 minutos atrás (sem período para comparar). */
  check(): Promise<VolumeEvaluation | null>;
}

export function createVolumeMonitor(deps: {
  workerDb: () => Db;
  reporter: () => ErrorReporter;
  logger?: Logger;
  limits?: Readonly<VolumeLimits>;
  now?: () => Date;
}): VolumeMonitor {
  const logger = deps.logger ?? defaultLogger;
  const now = deps.now ?? (() => new Date());
  return {
    async check() {
      const rows = await deps.workerDb().$queryRaw<
        Array<{
          tuples_read: bigint;
          window_minutes: number;
          baseline_per_hour: bigint | null;
          operator_actions_max: number;
        }>
      >`SELECT tuples_read, window_minutes, baseline_per_hour, operator_actions_max
          FROM app.security_volume_sample()`;
      const row = rows[0];
      if (!row) return null;
      const evaluation = evaluateVolume(
        {
          tuplesRead: Number(row.tuples_read),
          windowMinutes: row.window_minutes,
          baselinePerHour: row.baseline_per_hour === null ? null : Number(row.baseline_per_hour),
          operatorActionsMax: row.operator_actions_max,
        },
        deps.limits,
      );
      logger.info('observability.volume_checked', {
        count: evaluation.read.count,
        threshold: evaluation.read.threshold,
      });
      const occurredAt = now().toISOString();
      const alerts: Alert[] = [];
      if (evaluation.read.anomalous) {
        alerts.push({ name: 'security.read_volume_anomaly', occurredAt, ...pick(evaluation.read) });
      }
      if (evaluation.operator.anomalous) {
        alerts.push({
          name: 'security.operator_volume_anomaly',
          occurredAt,
          ...pick(evaluation.operator),
        });
      }
      for (const alert of alerts) await deps.reporter().captureAlert(alert);
      return evaluation;
    },
  };
}

function pick(v: { count: number; threshold: number }) {
  return { count: v.count, threshold: v.threshold };
}
