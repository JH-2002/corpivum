import type { JobQueue } from '@/adapters/jobs/types';
import type { VolumeMonitor } from './volume';

/**
 * `observability.volume_check` (de hora em hora, `app_worker`): alerta de volume anômalo de leitura das tabelas
 * de saúde e de ações por operador (P7-M1, 7b-R3, ADR-0038). Recorrente com `singletonKey`; reagenda mesmo após
 * falha. Idempotente: rodar duas vezes só encurta o período da amostra seguinte.
 */
export const VOLUME_CHECK_JOB = 'observability.volume_check';
export const VOLUME_CHECK_MS = 60 * 60 * 1000;

export function registerObservabilityJobs(
  queue: JobQueue,
  monitor: VolumeMonitor,
  now: () => Date = () => new Date(),
): void {
  queue.register(VOLUME_CHECK_JOB, async () => {
    try {
      await monitor.check();
    } finally {
      await queue.enqueue(
        VOLUME_CHECK_JOB,
        {},
        { runAt: new Date(now().getTime() + VOLUME_CHECK_MS), singletonKey: VOLUME_CHECK_JOB },
      );
    }
  });
}

export async function scheduleObservabilityJobs(
  queue: JobQueue,
  now: Date = new Date(),
): Promise<void> {
  await queue.enqueue(VOLUME_CHECK_JOB, {}, { runAt: now, singletonKey: VOLUME_CHECK_JOB });
}
