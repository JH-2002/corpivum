/**
 * Erros tipados da aplicação. Mensagens nunca carregam conteúdo de saúde, notas,
 * alimentação ou medidas (CLAUDE.md regra 5, LEG-R04): só códigos e metadados.
 */
export type AppErrorCode =
  | 'ENV_INVALID'
  | 'NOT_ENABLED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'ADAPTER_FAILURE'
  | 'FORBIDDEN_IN_PRODUCTION'
  | 'CONSENT_REQUIRED';

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

/** Configuração de ambiente inválida. `issues` contém só nomes de variáveis e motivos, nunca valores. */
export class EnvValidationError extends AppError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super('ENV_INVALID', `Configuração de ambiente inválida: ${issues.join('; ')}`);
    this.issues = issues;
  }
}

/** Funcionalidade desativada até existir finalidade, consentimento e revisão do RIPD (ex.: LEG-X04). */
export class NotEnabledError extends AppError {
  constructor(feature: string) {
    super('NOT_ENABLED', `Funcionalidade desativada: ${feature}`);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `Recurso não encontrado: ${resource}`);
  }
}

export class AdapterError extends AppError {
  constructor(adapter: string, operation: string, options?: { cause?: unknown }) {
    super('ADAPTER_FAILURE', `Falha no adaptador ${adapter} (${operation})`, options);
  }
}

/**
 * Tratamento bloqueado por falta de consentimento ativo para a finalidade (CLAUDE.md regra 1, LEG-C04).
 * Carrega só o identificador da finalidade.
 */
export class ConsentRequiredError extends AppError {
  readonly purpose: string;

  constructor(purpose: string) {
    super('CONSENT_REQUIRED', `Consentimento ativo necessário: ${purpose}`);
    this.purpose = purpose;
  }
}
