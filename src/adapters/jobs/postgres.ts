import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '@/lib/db/client';
import { logger as defaultLogger, type Logger } from '@/lib/logger';
import type { EnqueueOptions, JobHandler, JobPayload, JobQueue } from './types';

const payloadSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export interface PgJobQueueOptions {
  logger?: Logger;
  /** Intervalo entre buscas na fila quando ela está vazia. */
  pollMs?: number;
  /** Tempo de reserva de um job; depois disso, outro worker pode retomá-lo. */
  lockSeconds?: number;
  batchSize?: number;
  /**
   * Client do consumo (reservar, concluir, falhar): papel `app_worker` (ADR-0037). Só é pedido quando a fila é
   * consumida; quem só enfileira (web com JOB_WORKER=off) não precisa da credencial. Padrão: o mesmo client.
   */
  workerDb?: () => Db;
}

/** Atraso exponencial entre tentativas: 1 min, 2 min, 4 min... até 1 h. */
export function retryDelaySeconds(attempt: number): number {
  return Math.min(60 * 2 ** Math.max(attempt - 1, 0), 3600);
}

/**
 * Fila de jobs no próprio Postgres (OI-14, ADR-0019): dados no Brasil, sem subprocessador novo.
 * Acesso só pelas funções SECURITY DEFINER `app.jobs_*`: o runtime não lê a tabela.
 * - `FOR UPDATE SKIP LOCKED`: vários workers (instâncias) nunca executam o mesmo job ao mesmo tempo.
 * - `singletonKey`: no máximo um job na fila por chave (jobs recorrentes não duplicam; PR1a-R2-B6).
 * - Job travado (worker morreu) volta a ser executável quando a reserva vence: os handlers precisam ser
 *   idempotentes (rodar duas vezes não pode duplicar efeito), porque um handler acima de `lockSeconds` pode ser
 *   retomado por outro worker (PR1b-B8 a).
 * - Enfileirar usa o `app_user`; reservar, concluir e falhar só o `app_worker` (ADR-0037).
 * Logs só com nome, id, tentativa e código do erro (LEG-R04).
 */
export class PgJobQueue implements JobQueue {
  readonly id = 'postgres';
  readonly workerId = `w-${randomUUID()}`;
  readonly #db: Db;
  readonly #workerDb: () => Db;
  readonly #handlers = new Map<string, JobHandler>();
  readonly #logger: Logger;
  readonly #pollMs: number;
  readonly #lockSeconds: number;
  readonly #batchSize: number;
  #timer: NodeJS.Timeout | undefined;
  #running = false;

  constructor(db: Db, options: PgJobQueueOptions = {}) {
    this.#db = db;
    this.#workerDb = options.workerDb ?? (() => db);
    this.#logger = options.logger ?? defaultLogger;
    this.#pollMs = options.pollMs ?? 30_000;
    this.#lockSeconds = options.lockSeconds ?? 300;
    this.#batchSize = options.batchSize ?? 10;
  }

  async enqueue(name: string, payload: JobPayload, options: EnqueueOptions = {}): Promise<string> {
    const rows = await this.#db.$queryRaw<Array<{ id: string }>>`
      SELECT app.jobs_enqueue(${name}, ${JSON.stringify(payload)}::jsonb,
        ${options.runAt ?? new Date()}::timestamptz, ${options.maxAttempts ?? 3}::int,
        ${options.singletonKey ?? null}::text) AS id`;
    const id = rows[0]?.id;
    if (!id) throw new Error('enqueue sem id');
    return id;
  }

  register(name: string, handler: JobHandler): void {
    this.#handlers.set(name, handler);
  }

  /** Reserva e executa um lote de jobs vencidos. Devolve quantos terminaram com sucesso. */
  async runOnce(): Promise<number> {
    const names = [...this.#handlers.keys()];
    if (names.length === 0) return 0;
    const worker = this.#workerDb();
    const jobs = await worker.$queryRaw<
      Array<{ id: string; name: string; payload: unknown; attempts: number }>
    >`SELECT * FROM app.jobs_claim(${this.workerId}, ${names}::text[], ${this.#batchSize}::int,
        ${this.#lockSeconds}::int)`;
    let completed = 0;
    for (const job of jobs) {
      const handler = this.#handlers.get(job.name);
      const payload = payloadSchema.safeParse(job.payload);
      try {
        if (!handler || !payload.success) throw new TypeError('invalid job');
        await handler(payload.data, { jobId: job.id, attempt: job.attempts });
        await worker.$queryRaw`SELECT app.jobs_complete(${job.id}::uuid, ${this.workerId})`;
        completed += 1;
      } catch (error) {
        const errorCode = error instanceof Error ? error.name : 'unknown';
        this.#logger.warn('job.failed', {
          adapter: this.id,
          jobName: job.name,
          jobId: job.id,
          attempt: job.attempts,
          errorCode,
        });
        await worker.$queryRaw`SELECT app.jobs_fail(${job.id}::uuid, ${this.workerId}, ${errorCode},
          ${retryDelaySeconds(job.attempts)}::int)`;
      }
    }
    return completed;
  }

  /** Consome a fila em laço até `stop()`. Lote cheio: busca de novo na hora; vazio: espera `pollMs`. */
  start(): void {
    if (this.#timer || this.#running) return;
    const tick = async () => {
      this.#running = true;
      let delay = this.#pollMs;
      try {
        const done = await this.runOnce();
        if (done >= this.#batchSize) delay = 0;
      } catch {
        this.#logger.warn('job.poll_failed', { adapter: this.id });
      } finally {
        this.#running = false;
      }
      if (this.#timer !== undefined) {
        this.#timer = setTimeout(() => void tick(), delay);
        this.#timer.unref();
      }
    };
    this.#timer = setTimeout(() => void tick(), 0);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
  }
}
