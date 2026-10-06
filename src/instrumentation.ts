/**
 * Executado uma vez na subida do servidor (Next). Registra os jobs recorrentes.
 * Fase 1a: expurgo de dados de autenticação vencidos (ROPA T1/T5, ADR-0017).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startAuthJobs } = await import('./server-jobs');
  await startAuthJobs();
}
