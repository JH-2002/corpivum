import type { JobQueue } from '@/adapters/jobs/types';
import type { AuthService } from './service';

/**
 * Job de expurgo dos dados de autenticação vencidos (ROPA T1/T5, ADR-0017): sessões revogadas ou expiradas
 * e tokens usados ou vencidos há mais de 1 dia, e janelas de limite encerradas. Roda a cada 6 h e se
 * reagenda ao terminar. Payload vazio (LEG-R04).
 */
export const AUTH_PURGE_JOB = 'auth.purge_expired';
export const AUTH_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function registerAuthJobs(
  queue: JobQueue,
  service: Pick<AuthService, 'purgeExpired'>,
  now: () => Date = () => new Date(),
): void {
  queue.register(AUTH_PURGE_JOB, async () => {
    try {
      await service.purgeExpired();
    } finally {
      // Reagenda mesmo após falha: a próxima execução tenta de novo.
      await queue.enqueue(
        AUTH_PURGE_JOB,
        {},
        { runAt: new Date(now().getTime() + AUTH_PURGE_INTERVAL_MS) },
      );
    }
  });
}

/** Primeira execução (na subida do servidor). */
export async function scheduleAuthPurge(queue: JobQueue, now: Date = new Date()): Promise<string> {
  return queue.enqueue(AUTH_PURGE_JOB, {}, { runAt: now });
}
