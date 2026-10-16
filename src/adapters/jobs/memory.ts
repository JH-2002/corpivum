import { randomUUID } from 'node:crypto';
import { logger as defaultLogger, type Logger } from '@/lib/logger';
import { sanitizeError, type JobErrorSink } from '@/lib/observability/error-report';
import type { EnqueueOptions, JobHandler, JobPayload, JobQueue } from './types';

type JobStatus = 'pending' | 'done' | 'failed';

interface MemoryJob {
  id: string;
  name: string;
  payload: JobPayload;
  runAt: Date;
  attempts: number;
  maxAttempts: number;
  status: JobStatus;
  singletonKey: string | undefined;
  /** Em execução: o job pode reagendar a própria chave sem colidir consigo mesmo. */
  running: boolean;
}

/**
 * Fila em memória para DESENVOLVIMENTO e testes. Não persiste; `drain()` executa os jobs vencidos.
 * Falhas são registradas só com nome do job, id e tentativa; o erro vai ao `ErrorReporter` já reduzido (LEG-R04).
 */
export class MemoryJobQueue implements JobQueue {
  readonly id = 'memory';
  readonly #jobs: MemoryJob[] = [];
  readonly #handlers = new Map<string, JobHandler>();
  readonly #logger: Logger;
  readonly #onError: JobErrorSink | undefined;
  #draining = false;
  #again = false;

  /** `onError`: erro do handler vai ao `ErrorReporter` pela lista de campos permitidos (7c-R3, ADR-0039). */
  constructor(logger: Logger = defaultLogger, options: { onError?: JobErrorSink } = {}) {
    this.#logger = logger;
    this.#onError = options.onError;
  }

  async enqueue(name: string, payload: JobPayload, options: EnqueueOptions = {}): Promise<string> {
    if (options.singletonKey) {
      const existing = this.#jobs.find(
        (j) => j.singletonKey === options.singletonKey && j.status === 'pending' && !j.running,
      );
      if (existing) return existing.id;
    }
    const id = randomUUID();
    this.#jobs.push({
      id,
      name,
      payload,
      runAt: options.runAt ?? new Date(),
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 3,
      status: 'pending',
      singletonKey: options.singletonKey,
      running: false,
    });
    return id;
  }

  register(name: string, handler: JobHandler): void {
    this.#handlers.set(name, handler);
  }

  async processNow(): Promise<void> {
    await this.drain();
  }

  /**
   * Executa os jobs pendentes com `runAt <= now`. Retorna quantos foram concluídos. Uma chamada
   * enquanto outra ainda roda não executa nada em paralelo (o mesmo job nunca roda duas vezes,
   * PR1a-R2-B6): só pede mais uma passada ao fim da atual, para um job enfileirado no meio não esperar o
   * próximo ciclo (ex.: exportação pedida agora, ADR-0032).
   */
  async drain(now?: Date): Promise<number> {
    if (this.#draining) {
      this.#again = true;
      return 0;
    }
    this.#draining = true;
    try {
      let completed = await this.#drain(now ?? new Date());
      while (this.#again) {
        this.#again = false;
        completed += await this.#drain(new Date());
      }
      return completed;
    } finally {
      this.#draining = false;
    }
  }

  async #drain(now: Date): Promise<number> {
    let completed = 0;
    for (const job of this.#jobs) {
      if (job.status !== 'pending' || job.runAt > now) continue;
      const handler = this.#handlers.get(job.name);
      if (!handler) continue;

      job.attempts += 1;
      job.running = true;
      try {
        await handler(job.payload, { jobId: job.id, attempt: job.attempts });
        job.status = 'done';
        completed += 1;
      } catch (error) {
        if (job.attempts >= job.maxAttempts) job.status = 'failed';
        this.#logger.warn('job.failed', {
          adapter: this.id,
          jobName: job.name,
          jobId: job.id,
          attempt: job.attempts,
          errorCode: sanitizeError(error).name,
        });
        await this.#onError?.(error, {
          name: job.name,
          id: job.id,
          attempt: job.attempts,
          adapter: this.id,
        });
      } finally {
        job.running = false;
      }
    }
    return completed;
  }

  statusOf(jobId: string): JobStatus | undefined {
    return this.#jobs.find((j) => j.id === jobId)?.status;
  }
}
