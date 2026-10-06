/**
 * Provedor de LLM (§27, LEG-I03). Implementações reais exigem: DPA, sem uso para treino,
 * retenção zero/mínima (inclusive logs de abuso), região documentada em docs/privacy/SUBPROCESSORS.md.
 * Quem chama é responsável pelo gate de consentimento (LEG-I01) e pela minimização (LEG-I02).
 */
export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmCompletionRequest {
  messages: readonly LlmMessage[];
  maxOutputTokens: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmCompletionResult {
  text: string;
  model: string;
  usage: LlmUsage;
  latencyMs: number;
}

export interface LlmProvider {
  readonly id: string;
  /** Região onde o provedor processa os dados (LEG-S10). */
  readonly region: string;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
}
