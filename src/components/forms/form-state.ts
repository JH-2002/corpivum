/** Estado devolvido pelas server actions de formulário. Mensagens já traduzidas no servidor. */
export interface FormState {
  status: 'idle' | 'error' | 'success';
  /** Mensagem geral (erro ou sucesso). */
  message?: string;
  /** Erros por campo (nome do input → mensagem). */
  fieldErrors?: Record<string, string>;
  /** Dados extras de sucesso (ex.: códigos de recuperação mostrados uma vez). */
  data?: Record<string, string | string[]>;
}

export const INITIAL_FORM_STATE: FormState = { status: 'idle' };

/** Formulário de exemplo da demo (ADR-0047): mesmo sem `action`, o envio nativo (GET na própria rota) não acontece. */
export function preventSubmit(event: { preventDefault: () => void }): void {
  event.preventDefault();
}
