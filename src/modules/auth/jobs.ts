import type { JobQueue } from '@/adapters/jobs/types';
import type { AuthService } from './service';

/**
 * Job de expurgo dos dados de autenticação vencidos (ROPA T1/T5, ADR-0017/0018): sessões revogadas ou
 * expiradas e tokens usados ou vencidos há mais de 1 dia, janelas de limite encerradas, contas com e-mail
 * nunca verificado após 7 dias e segredos TOTP de ativações abandonadas após 1 dia.
 *
 * Premissa (PR1a-R3-B8): apagar contas só leva em cascata tabelas de auth e de dados do próprio usuário. As
 * provas (consentimentos, pedidos, AuditLog) e o AccessLog não têm FK para `users` e ficam (ADR-0019).
 *
 * Roda a cada 6 h e se reagenda ao terminar. `singletonKey`: várias instâncias agendando o job não criam
 * várias cadeias (PR1a-R2-B6). Payload vazio (LEG-R04).
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
        {
          runAt: new Date(now().getTime() + AUTH_PURGE_INTERVAL_MS),
          singletonKey: AUTH_PURGE_JOB,
        },
      );
    }
  });
}

/** Primeira execução (na subida do servidor). Não duplica se outra instância já agendou. */
export async function scheduleAuthPurge(queue: JobQueue, now: Date = new Date()): Promise<string> {
  return queue.enqueue(AUTH_PURGE_JOB, {}, { runAt: now, singletonKey: AUTH_PURGE_JOB });
}
