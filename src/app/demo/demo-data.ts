import 'server-only';
import { readPeriod } from '@/lib/period-server';
import { readPrivacyMode } from '@/lib/privacy-mode-server';
import { createDemoSourceFor } from '@/modules/health/server';

/**
 * Fonte de dados do demo público: gerador em memória, sem banco e sem sessão (LEG-X02). `hidden`: modo
 * privacidade (ADR-0035), que também vale no demo.
 */
export async function demoContext() {
  const { range, today } = await readPeriod();
  return { range, today, source: createDemoSourceFor(today), hidden: await readPrivacyMode() };
}
