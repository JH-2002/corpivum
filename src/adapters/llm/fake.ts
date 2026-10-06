import type { LlmCompletionRequest, LlmCompletionResult, LlmProvider } from './types';

const countTokens = (text: string) => text.split(/\s+/).filter(Boolean).length;

const CANNED_WORDS = 'Resposta simulada pelo provedor local de desenvolvimento.'.split(' ');

/** LLM falso, determinístico e sem rede. Nunca envia dados para fora do processo. */
export class FakeLlmProvider implements LlmProvider {
  readonly id = 'fake';
  readonly region = 'local';

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const inputTokens = request.messages.reduce((sum, m) => sum + countTokens(m.content), 0);
    const text = CANNED_WORDS.slice(0, Math.max(1, request.maxOutputTokens)).join(' ');
    return {
      text,
      model: 'fake-llm-v1',
      usage: { inputTokens, outputTokens: countTokens(text) },
      latencyMs: 0,
    };
  }
}
