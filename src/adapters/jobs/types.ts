/**
 * Fila de jobs (lembretes, relatórios, exportações, purga). Região no Brasil (LEG-S10).
 * Payload aceita só valores primitivos: carregue IDs, nunca conteúdo sensível — o job busca
 * o dado no banco com o contexto do usuário.
 */
export type JobPayload = Readonly<Record<string, string | number | boolean | null>>;

export interface EnqueueOptions {
  /** Execução agendada; padrão: imediata. */
  runAt?: Date;
  maxAttempts?: number;
  /**
   * No máximo um job ainda não iniciado por chave: enfileirar de novo devolve o job existente
   * (jobs recorrentes não duplicam entre instâncias; PR1a-R2-B6). Formato: `[A-Za-z0-9_.:-]{1,128}`.
   */
  singletonKey?: string;
}

export type JobHandler = (
  payload: JobPayload,
  context: { jobId: string; attempt: number },
) => Promise<void>;

export interface JobQueue {
  readonly id: string;
  enqueue(name: string, payload: JobPayload, options?: EnqueueOptions): Promise<string>;
  register(name: string, handler: JobHandler): void;
}
// Sem cancelamento genérico: cancelar é uma operação de domínio, na transação e só da própria pessoa
// (ex.: app.health_elimination_cancel; revisão M4 da ADR-0019).
