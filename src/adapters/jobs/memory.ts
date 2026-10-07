import { randomUUID } from 'node:crypto';
import { logger as defaultLogger, type Logger } from '@/lib/logger';
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
 * Falhas são registradas só com nome do job, id e tentativa (LEG-R04).
 */
export class MemoryJobQueue implements JobQueue {
  readonly id = 'memory';
  readonly #jobs: MemoryJob[] = [];
  readonly #handlers = new Map<string, JobHandler>();
  readonly #logger: Logger;
  #draining = false;

  constructor(logger: Logger = defaultLogger) {
    this.#logger = logger;
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

  /**
   * Executa os jobs pendentes com `runAt <= now`. Retorna quantos foram concluídos. Uma chamada
   * enquanto outra ainda roda não faz nada: o mesmo job nunca executa duas vezes (PR1a-R2-B6).
   */
  async drain(now: Date = new Date()): Promise<number> {
    if (this.#draining) return 0;
    this.#draining = true;
    try {
      return await this.#drain(now);
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
          errorCode: error instanceof Error ? error.name : 'unknown',
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
