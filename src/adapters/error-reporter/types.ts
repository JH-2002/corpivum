/**
 * Ferramenta de erros e alertas (LEG-R04, ADR-0036 D2, ADR-0038). O adaptador recebe só relatórios já montados
 * por lista de campos permitidos (`src/lib/observability/error-report.ts`): nunca a mensagem do erro, o corpo,
 * a query, os cabeçalhos ou os cookies da requisição, nem o caminho pedido (só a rota como arquivo).
 * O fornecedor real entra em docs/privacy/SUBPROCESSORS.md antes de ser ativado (OI-03, OI-11).
 */
export type RouteType = 'render' | 'route' | 'action' | 'proxy';

export interface SanitizedError {
  /** Nome da classe (`TypeError`, `PrismaClientKnownRequestError`) ou `Unknown`. Nunca a mensagem. */
  name: string;
  /** Código técnico: `AppError.code`, Prisma (`P2002`), SQLSTATE (`42501`), Node (`ECONNREFUSED`). */
  code?: string;
  /** `digest` do Next (número ou constante como `DYNAMIC_SERVER_USAGE`). */
  digest?: string;
  /** Um nível da causa encadeada, só nome e código. */
  cause?: { name: string; code?: string };
  /** Até 10 quadros da pilha como `arquivo:linha:coluna` (só o nome do arquivo, sem pasta). */
  frames: string[];
}

export interface RequestErrorReport {
  /** Id do relatório (correlaciona o log com a ferramenta), nunca da pessoa. */
  id: string;
  occurredAt: string;
  source: 'request';
  error: SanitizedError;
  request: {
    method: string;
    /** Rota como arquivo (`/(app)/corpo/page`), sem valores dos segmentos dinâmicos nem query. */
    route: string;
    routeType: RouteType | 'unknown';
    routerKind?: 'App Router' | 'Pages Router';
    renderSource?: string;
    revalidateReason?: 'on-demand' | 'stale';
    renderType?: 'dynamic' | 'dynamic-resume';
  };
}

/** Alertas de volume (P7-M1, 7b-R3): só a contagem e o teto, sem pessoa, papel ou recurso. */
export type AlertName = 'security.read_volume_anomaly' | 'security.operator_volume_anomaly';

export interface Alert {
  name: AlertName;
  count: number;
  threshold: number;
  occurredAt: string;
}

export interface ErrorReporter {
  readonly id: string;
  captureError(report: RequestErrorReport): Promise<void>;
  captureAlert(alert: Alert): Promise<void>;
}
