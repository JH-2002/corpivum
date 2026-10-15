import { z } from 'zod';
import type { JobQueue } from '@/adapters/jobs/types';
import { EXPORT_JOB, type ReportsService } from './service';

/**
 * Jobs da exportação (ADR-0032). Payloads só com IDs (LEG-R04).
 * - `reports.generate` ({ userId, jobId }): gera o arquivo; rechecha consentimento e estado.
 * - `reports.expire` (de hora em hora): marca vencidos e apaga os arquivos (teto de 24 h, LEG-D03).
 */
export const EXPORT_EXPIRE_JOB = 'reports.expire';
export const EXPORT_EXPIRE_MS = 60 * 60 * 1000;

const generatePayload = z.object({ userId: z.uuid(), jobId: z.uuid() });

export function registerReportJobs(
  queue: JobQueue,
  service: Pick<ReportsService, 'generate' | 'expireDue'>,
  now: () => Date = () => new Date(),
): void {
  queue.register(EXPORT_JOB, async (payload) => {
    const { userId, jobId } = generatePayload.parse(payload);
    await service.generate(userId, jobId);
  });
  queue.register(EXPORT_EXPIRE_JOB, async () => {
    try {
      await service.expireDue();
    } finally {
      await queue.enqueue(
        EXPORT_EXPIRE_JOB,
        {},
        { runAt: new Date(now().getTime() + EXPORT_EXPIRE_MS), singletonKey: EXPORT_EXPIRE_JOB },
      );
    }
  });
}

export async function scheduleReportJobs(queue: JobQueue, now: Date = new Date()): Promise<void> {
  await queue.enqueue(EXPORT_EXPIRE_JOB, {}, { runAt: now, singletonKey: EXPORT_EXPIRE_JOB });
}
