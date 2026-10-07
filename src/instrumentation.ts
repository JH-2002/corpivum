/**
 * Executado uma vez na subida do servidor (Next). Registra os jobs recorrentes.
 * Expurgo de auth (ROPA T1/T5, ADR-0017) e retenção/eliminação da Fase 1b (ADR-0019).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startJobs } = await import('./server-jobs');
  await startJobs();
}
