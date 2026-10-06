import { getAdapters } from '@/adapters';
import { MemoryJobQueue } from '@/adapters/jobs/memory';
import { logger } from '@/lib/logger';
import { registerAuthJobs, scheduleAuthPurge } from '@/modules/auth/jobs';
import { getAuthService } from '@/modules/auth/server';

const MEMORY_DRAIN_MS = 60 * 1000;

/**
 * Registra e agenda os jobs de auth. Com a fila em memória (dev/test), um laço local consome a fila;
 * com uma fila real (Fase 7), os workers do provedor executam.
 */
export async function startAuthJobs(): Promise<void> {
  const { jobs } = getAdapters();
  registerAuthJobs(jobs, getAuthService());
  await scheduleAuthPurge(jobs);
  if (jobs instanceof MemoryJobQueue) {
    void jobs.drain().catch(() => logger.warn('job.drain_failed', { adapter: jobs.id }));
    const timer = setInterval(() => {
      jobs.drain().catch(() => logger.warn('job.drain_failed', { adapter: jobs.id }));
    }, MEMORY_DRAIN_MS);
    timer.unref();
  }
  logger.info('jobs.registered', { jobName: 'auth.purge_expired' });
}
