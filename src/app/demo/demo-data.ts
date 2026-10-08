import 'server-only';
import { readPeriod } from '@/lib/period-server';
import { createDemoSourceFor } from '@/modules/health/server';

/** Fonte de dados do demo público: gerador em memória, sem banco e sem sessão (LEG-X02). */
export async function demoContext() {
  const { range, today } = await readPeriod();
  return { range, today, source: createDemoSourceFor(today) };
}
