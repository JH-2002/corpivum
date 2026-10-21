import type { Instrumentation } from 'next';

/**
 * Executado uma vez na subida do servidor (Next). Registra os jobs recorrentes.
 * Expurgo de auth (ROPA T1/T5, ADR-0017) e retenção/eliminação da Fase 1b (ADR-0019).
 * Em produção, a guarda do console vem antes de tudo (PR1a-B5, ADR-0038). No modo só demo, nenhum job.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.APP_ENV === 'production') {
    const { installConsoleGuard } = await import('./lib/observability/console-guard');
    installConsoleGuard();
  }
  // Modo só demo (ADR-0043): sem banco, fila nem jobs. O ambiente é conferido na subida (falha alto se houver
  // credencial do app completo definida) e nenhum job é registrado.
  const { isDemoOnly } = await import('./lib/demo-mode');
  if (isDemoOnly()) {
    const { parseDemoEnv } = await import('./lib/demo-env');
    parseDemoEnv(process.env);
    return;
  }
  const { startJobs } = await import('./server-jobs');
  await startJobs();
}

/**
 * Erros do servidor (render, route handler, server action, proxy) vão ao `ErrorReporter` só depois de passar
 * pela lista de campos permitidos (LEG-R04, ADR-0036 D2, ADR-0038). Nunca lança.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { reportRequestError } = await import('./lib/observability/report');
  await reportRequestError(error, request, context);
};
